"use server"

import { eq, sql } from "drizzle-orm"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { updateTag } from "next/cache"
import { queryDb, sqlDb } from "@/lib/db"
import { patterns, tags } from "@/lib/db/schema"
import { deleteFromOss, signUrl } from "@/lib/oss"
import { getAllPatterns, getAllTags } from "@/lib/queries"
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

/** 图片清理属于后置工作，不应延迟 Server Action 的正常响应。 */
function scheduleUnreferencedOssCleanup(keys: string[], keepKeys: string[] = []) {
    if (keys.length === 0) return
    const cleanup = deleteUnreferencedOssKeys(keys, keepKeys).catch((error) => {
        console.error("[patterns] OSS cleanup failed:", error)
    })

    try {
        const context = getCloudflareContext()
        const workerContext = context.ctx as { waitUntil?: (promise: Promise<unknown>) => void }
        if (workerContext.waitUntil) {
            workerContext.waitUntil(cleanup)
            return
        }
    } catch {
        // 本地开发环境没有 Worker 生命周期上下文，清理任务仍在后台继续。
    }
}

export type PatternInput = {
    name: string
    studio: string
    categories: string[]
    /** 图片 key 数组，至少 1 张。第一张为主图/缩略图。 */
    images: string[]
    fileUrl?: string | null
    fileName?: string | null
    cloudDriveUrl?: string | null
    note?: string | null
}

export async function listPatterns() {
    return getAllPatterns()
}

/** 后台同步数据使用 Server Action 调用，客户端可以安全捕获瞬时读取失败。 */
export async function getGallerySnapshot() {
    const [patterns, tags] = await Promise.all([getAllPatterns(), getAllTags()])
    return { patterns, tags }
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
            INSERT INTO patterns (name, studio, categories, thumbnail_url, images, file_url, file_name, cloud_drive_url, note)
            VALUES (
                ${input.name.trim()},
                ${input.studio.trim()},
                ${input.categories ?? []}::text[],
                ${primaryKey},
                ${imageKeys}::text[],
                ${input.fileUrl || null},
                ${input.fileName?.trim() || null},
                ${input.cloudDriveUrl?.trim() || null},
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

/** 单条 SQL 原子插入整批纸样，避免逐条写入超时后只保存一部分。 */
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

    const payload = valid.map((input) => {
        const images = cleanImageKeys(input.images)
        return {
            name: input.name.trim(),
            studio: input.studio.trim(),
            categories: normalizedCategories.get(input) ?? [],
            thumbnail_url: images[0]!,
            images,
            file_url: input.fileUrl || null,
            file_name: input.fileName?.trim() || null,
            cloud_drive_url: input.cloudDriveUrl?.trim() || null,
            note: input.note?.trim() || null,
        }
    })
    const inserted = await queryWithRetry(() =>
        sqlDb`
            WITH inserted AS (
                INSERT INTO patterns (name, studio, categories, thumbnail_url, images, file_url, file_name, cloud_drive_url, note)
                SELECT
                    item.name,
                    item.studio,
                    item.categories,
                    item.thumbnail_url,
                    item.images,
                    item.file_url,
                    item.file_name,
                    item.cloud_drive_url,
                    item.note
                FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS item(
                    name text,
                    studio text,
                    categories text[],
                    thumbnail_url text,
                    images text[],
                    file_url text,
                    file_name text,
                    cloud_drive_url text,
                    note text
                )
                RETURNING id
            )
            SELECT id FROM inserted ORDER BY id
        `,
    )
    const insertedIds = (inserted as Array<{ id: number }>).map((row) => Number(row.id))
    if (insertedIds.length !== valid.length) {
        throw new Error(`批量保存不完整：预期 ${valid.length} 条，实际保存 ${insertedIds.length} 条`)
    }

    updateTag("patterns")
    return insertedIds
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
                cloud_drive_url = ${input.cloudDriveUrl?.trim() || null},
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
    scheduleUnreferencedOssCleanup(removedKeys, imageKeys)

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
        scheduleUnreferencedOssCleanup(keys)
    }
    // Gallery 已先在当前设备乐观移除该条记录；此处不立即重验证整个 RSC 页面，
    // 避免删除一条纸样时触发整页数据刷新。其他设备通过 15 秒轮询读取更新。
}
