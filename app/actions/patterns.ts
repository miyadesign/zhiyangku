"use server"

import { eq, sql } from "drizzle-orm"
import { updateTag } from "next/cache"
import { queryDb, sqlDb } from "@/lib/db"
import { patterns, tags } from "@/lib/db/schema"
import { deleteFromOss, signUrl } from "@/lib/oss"
import { getAllPatterns } from "@/lib/queries"
import { queryWithRetry } from "@/lib/db/retry"

function toSignedUrl(key: string | null): string {
    if (!key) return ""
    if (/^https?:\/\//i.test(key)) return key
    return signUrl(key)
}

/**
 * 编辑器读取图片时使用同源代理地址（/api/file?key=...），但数据库只应
 * 保存 OSS object key。把代理 URL 还原成 key，避免一次编辑把纸样其余图片
 * 的数据库记录改成代理 URL，导致代理再把整段 URL 当作 OSS 文件名查询。
 */
function normalizeImageKey(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return ""

    // 多次编辑过的旧记录可能出现代理地址嵌套，逐层解开。
    let key = trimmed
    for (let depth = 0; depth < 10; depth += 1) {
        try {
            // 支持相对地址，也兼容部署域名下的绝对 /api/file 地址。
            const url = new URL(key, "https://local.invalid")
            if (url.pathname !== "/api/file") break
            const originalKey = url.searchParams.get("key")
            if (!originalKey) break
            key = originalKey.trim()
        } catch {
            // 非 URL 格式作为原始 OSS key 继续处理。
            break
        }
    }

    return key
}

/** 过滤空值，并确保数据库中存的是原始图片 key，而不是代理地址。 */
function cleanImageKeys(input: string[]): string[] {
    return input
        .filter((k): k is string => typeof k === "string")
        .map(normalizeImageKey)
        .filter(Boolean)
}

/** 删除已从纸样移除、且没有被其他纸样继续引用的 OSS 对象。 */
async function deleteUnreferencedOssKeys(keys: string[], keepKeys: string[] = []) {
    const keep = new Set(keepKeys.map(normalizeImageKey).filter(Boolean))
    const candidates = [...new Set(keys.map(normalizeImageKey).filter(Boolean))]
        .filter((key) => !keep.has(key) && !/^https?:\/\//i.test(key))
    if (candidates.length === 0) return

    let rows: { images: string[]; fileUrl: string | null }[]
    try {
        rows = await queryDb((db) =>
            db.select({ images: patterns.images, fileUrl: patterns.fileUrl }).from(patterns),
        )
    } catch (error) {
        console.error("[patterns] Could not verify OSS image references; skipping deletion", error)
        return
    }
    const referenced = new Set<string>()
    for (const row of rows) {
        for (const key of row.images ?? []) {
            const normalized = normalizeImageKey(key)
            if (normalized) referenced.add(normalized)
        }
        if (row.fileUrl) {
            const normalized = normalizeImageKey(row.fileUrl)
            if (normalized) referenced.add(normalized)
        }
    }

    await Promise.all(
        candidates
            .filter((key) => !referenced.has(key))
            .map((key) => deleteFromOss(key)),
    )
}

export type PatternInput = {
    name: string
    studio: string
    categories: string[]
    /** 图片 key 数组，至少 1 张。第一张为主图/缩略图。 */
    images: string[]
    fileUrl?: string | null
    fileName?: string | null
    note?: string | null
}

export async function listPatterns() {
    return getAllPatterns()
}

export type CreatePatternResult = {
    id: number | null
    imageUrls: string[]
    thumbnailUrl: string
    fileUrl?: string | null
}

/** 用 raw SQL 插入纸样，绕开 Drizzle 0.45.x 在 INSERT 多字段时的 param 顺序错位问题。 */
export async function createPattern(input: PatternInput): Promise<CreatePatternResult> {
    if (!input.name?.trim()) throw new Error("请填写纸样名称")
    if (!input.studio?.trim()) throw new Error("请选择或填写工作室")
    const imageKeys = cleanImageKeys(input.images)
    if (imageKeys.length === 0) throw new Error("请上传纸样图片")
    const primaryKey = imageKeys[0]!

    const rows = await queryWithRetry(() =>
        sqlDb`
            INSERT INTO patterns (name, studio, categories, thumbnail_url, images, file_url, file_name, note)
            VALUES (
                ${input.name.trim()},
                ${input.studio.trim()},
                ${input.categories ?? []}::text[],
                ${primaryKey},
                ${imageKeys}::text[],
                ${input.fileUrl || null},
                ${input.fileName?.trim() || null},
                ${input.note?.trim() || null}
            )
            RETURNING id
        `,
    )

    updateTag("patterns")
    const imageUrls = imageKeys.map(toSignedUrl)
    return {
        id: (rows as Array<{ id: number }>)[0]?.id ?? null,
        imageUrls,
        thumbnailUrl: imageUrls[0] ?? "",
        fileUrl: input.fileUrl ? toSignedUrl(input.fileUrl) : null,
    } as CreatePatternResult
}

/** 批量插入同样绕开 Drizzle */
export async function createPatternsBatch(inputs: PatternInput[]) {
    const valid = inputs.filter(
        (i) => i.name?.trim() && i.studio?.trim() && cleanImageKeys(i.images).length > 0,
    )
    if (valid.length === 0) throw new Error("没有可导入的有效数据")

    // Excel may contain categories that have not been created in the tag
    // manager yet. Create them before inserting patterns so the filters and
    // badges can resolve their colors immediately.
    const normalizedCategories = new Map<PatternInput, string[]>(
        valid.map((input): [PatternInput, string[]] => [
            input,
            [...new Set((input.categories ?? []).map((name) => name.trim()).filter(Boolean))],
        ]),
    )
    const categoryNames = [...new Set([...normalizedCategories.values()].flat())]
    if (categoryNames.length > 0) {
        await queryDb(async (db) => {
            const [{ maxOrder }] = await db
                .select({ maxOrder: sql<number>`coalesce(max(${tags.sortOrder}), 0)` })
                .from(tags)
            await db
                .insert(tags)
                .values(
                    categoryNames.map((name, index) => ({
                        name,
                        color: "slate",
                        sortOrder: (maxOrder ?? 0) + index + 1,
                    })),
                )
                .onConflictDoNothing({ target: tags.name })
        })
        updateTag("tags")
    }

    const insertedIds: number[] = []
    for (const input of valid) {
        const imageKeys = cleanImageKeys(input.images)
        const primaryKey = imageKeys[0]!
        const rows = await queryWithRetry(() =>
            sqlDb`
                INSERT INTO patterns (name, studio, categories, thumbnail_url, images, file_url, file_name, note)
                VALUES (
                    ${input.name.trim()},
                    ${input.studio.trim()},
                    ${normalizedCategories.get(input) ?? []}::text[],
                    ${primaryKey},
                    ${imageKeys}::text[],
                    ${input.fileUrl || null},
                    ${input.fileName?.trim() || null},
                    ${input.note?.trim() || null}
                )
                RETURNING id
            `,
        )
        insertedIds.push((rows as Array<{ id: number }>)[0]?.id)
    }

    updateTag("patterns")
    return insertedIds.length
}

/** Update 同上 */
export async function updatePattern(id: number, input: PatternInput) {
    if (!input.name?.trim()) throw new Error("请填写纸样名称")
    if (!input.studio?.trim()) throw new Error("请选择或填写工作室")
    const imageKeys = cleanImageKeys(input.images)
    if (imageKeys.length === 0) throw new Error("请上传纸样图片")
    const primaryKey = imageKeys[0]!
    const previous = await queryDb(async (db) => {
        const [row] = await db.select({ images: patterns.images }).from(patterns).where(eq(patterns.id, id))
        return row
    })

    await queryWithRetry(() =>
        sqlDb`
            UPDATE patterns SET
                name = ${input.name.trim()},
                studio = ${input.studio.trim()},
                categories = ${input.categories ?? []}::text[],
                thumbnail_url = ${primaryKey},
                images = ${imageKeys}::text[],
                file_url = ${input.fileUrl || null},
                file_name = ${input.fileName?.trim() || null},
                note = ${input.note?.trim() || null},
                updated_at = NOW()
            WHERE id = ${id}
        `,
    )

    const retainedKeys = new Set(imageKeys)
    const removedKeys = (previous?.images ?? [])
        .map(normalizeImageKey)
        .filter((key) => key && !retainedKeys.has(key))
    // 额外保护本次保存后仍在该纸样图片列表中的 key，避免数据库读取短暂滞后
    // 或历史地址格式差异导致误删仍在使用的图片。
    await deleteUnreferencedOssKeys(removedKeys, imageKeys)

    updateTag("patterns")
}

export async function deletePattern(id: number) {
    const row = await queryDb(async (db) => {
        const [r] = await db.select().from(patterns).where(eq(patterns.id, id))
        return r
    })
    if (row) {
        // 先删 DB，再检查剩余纸样是否仍引用这些 OSS 对象。
        await queryDb((db) => db.delete(patterns).where(eq(patterns.id, id)))
        const keys = [
            ...(row.images ?? []),
            row.fileUrl ?? null,
        ].filter(Boolean) as string[]
        await deleteUnreferencedOssKeys(keys)
    }
    updateTag("patterns")
}
