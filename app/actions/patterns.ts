"use server"

import { eq } from "drizzle-orm"
import { revalidatePath, revalidateTag } from "next/cache"
import { queryDb, sqlDb } from "@/lib/db"
import { patterns } from "@/lib/db/schema"
import { deleteFromOss, signUrl } from "@/lib/oss"
import { getAllPatterns } from "@/lib/queries"
import { queryWithRetry } from "@/lib/db/retry"

function toSignedUrl(key: string | null): string {
  if (!key) return ""
  if (/^https?:\/\//i.test(key)) return key
  return signUrl(key)
}

export type PatternInput = {
  name: string
  studio: string
  categories: string[]
  thumbnailUrl: string
  sizeChartUrl?: string | null
  fileUrl?: string | null
  fileName?: string | null
  note?: string | null
}

export async function listPatterns() {
  return getAllPatterns()
}

export type CreatePatternResult = {
    id: number | null
    thumbnailUrl: string
    sizeChartUrl?: string | null
    fileUrl?: string | null
}

/** 用 raw SQL 插入纸样，绕开 Drizzle 0.45.x 在 INSERT 多字段时的 param 顺序错位问题。 */
export async function createPattern(input: PatternInput): Promise<CreatePatternResult> {
    if (!input.name?.trim()) throw new Error("请填写纸样名称")
    if (!input.studio?.trim()) throw new Error("请选择或填写工作室")
    if (!input.thumbnailUrl) throw new Error("请上传纸样图片")

    const rows = await queryWithRetry(() =>
        sqlDb`
            INSERT INTO patterns (name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note)
            VALUES (
                ${input.name.trim()},
                ${input.studio.trim()},
                ${input.categories ?? []}::text[],
                ${input.thumbnailUrl},
                ${input.sizeChartUrl || null},
                ${input.fileUrl || null},
                ${input.fileName?.trim() || null},
                ${input.note?.trim() || null}
            )
            RETURNING id
        `,
    )

    revalidateTag("patterns", "layout")
    revalidatePath("/")
    return {
        id: (rows as Array<{ id: number }>)[0]?.id ?? null,
        thumbnailUrl: toSignedUrl(input.thumbnailUrl),
        sizeChartUrl: input.sizeChartUrl ? toSignedUrl(input.sizeChartUrl) : null,
        fileUrl: input.fileUrl ? toSignedUrl(input.fileUrl) : null,
    } as CreatePatternResult
}

/** 批量插入同样绕开 Drizzle */
export async function createPatternsBatch(inputs: PatternInput[]) {
    const valid = inputs.filter((i) => i.name?.trim() && i.studio?.trim() && i.thumbnailUrl)
    if (valid.length === 0) throw new Error("没有可导入的有效数据")

    const insertedIds: number[] = []
    for (const input of valid) {
        const rows = await queryWithRetry(() =>
            sqlDb`
                INSERT INTO patterns (name, studio, categories, thumbnail_url, size_chart_url, file_url, file_name, note)
                VALUES (
                    ${input.name.trim()},
                    ${input.studio.trim()},
                    ${input.categories ?? []}::text[],
                    ${input.thumbnailUrl},
                    ${input.sizeChartUrl || null},
                    ${input.fileUrl || null},
                    ${input.fileName?.trim() || null},
                    ${input.note?.trim() || null}
                )
                RETURNING id
            `,
        )
        insertedIds.push((rows as Array<{ id: number }>)[0]?.id)
    }

    revalidateTag("patterns", "layout")
    revalidatePath("/")
    return insertedIds.length
}

/** Update 同上 */
export async function updatePattern(id: number, input: PatternInput) {
    if (!input.name?.trim()) throw new Error("请填写纸样名称")
    if (!input.studio?.trim()) throw new Error("请选择或填写工作室")
    if (!input.thumbnailUrl) throw new Error("请上传纸样图片")

    await queryWithRetry(() =>
        sqlDb`
            UPDATE patterns SET
                name = ${input.name.trim()},
                studio = ${input.studio.trim()},
                categories = ${input.categories ?? []}::text[],
                thumbnail_url = ${input.thumbnailUrl},
                size_chart_url = ${input.sizeChartUrl || null},
                file_url = ${input.fileUrl || null},
                file_name = ${input.fileName?.trim() || null},
                note = ${input.note?.trim() || null},
                updated_at = NOW()
            WHERE id = ${id}
        `,
    )

    revalidateTag("patterns", "layout")
    revalidatePath("/")
}

export async function deletePattern(id: number) {
    const row = await queryDb(async (db) => {
        const [r] = await db.select().from(patterns).where(eq(patterns.id, id))
        return r
    })
    if (row) {
        // 先删 DB，立刻响应客户端；OSS 清理后台异步进行
        await queryDb((db) => db.delete(patterns).where(eq(patterns.id, id)))
        // 后台清理 OSS 资源（不阻塞删除请求）
        const keys = [row.thumbnailUrl, row.sizeChartUrl, row.fileUrl].filter(Boolean) as string[]
        queueMicrotask(() => {
            Promise.all(
                keys.map((key) => {
                    if (/^https?:\/\//i.test(key)) return Promise.resolve()
                    return deleteFromOss(key)
                }),
            ).catch(() => {})
        })
    }
    revalidateTag("patterns", "layout")
    revalidatePath("/")
}
