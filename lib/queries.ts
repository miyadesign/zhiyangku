import "server-only"
import { asc, desc } from "drizzle-orm"
import { unstable_cache } from "next/cache"
import { queryDb } from "@/lib/db"
import { patterns, tags } from "@/lib/db/schema"
import { signUrl } from "@/lib/oss"
import type { TagInfo } from "@/lib/constants"
import type { GalleryPattern } from "@/lib/gallery-types"

/**
 * DB 里只存 OSS key（如 patterns/images/xxx.png）。
 * 服务端在缓存层就把 key 转成带签名的 CDN URL，
 * 前端拿到 https://...oss-ap-southeast-1...aliyuncs.com/...?Signature=xxx，
 * 浏览器直接走 CDN 并发拉取，不需要再请求我们的 Next.js 路由中转。
 */
function toSignedUrl(key: string | null): string {
    if (!key) return ""
    if (/^https?:\/\//i.test(key)) return key
    return signUrl(key)
}

// 仅缓存数据库原始行（OSS key）。签名 URL 每次重新生成，
// 避免 unstable_cache 缓存住 1 小时后过期的签名导致破图。
//
// 写入路径：createPattern/createPatternsBatch/updatePattern/deletePattern
//   调用 updateTag("patterns")，Next.js 会把标记为该 tag 的所有缓存标记失效，
//   下次读取会重新走 DB；不在原 unstable_cache 里读取，避免 30s 内还命中旧数据。
const getAllPatternsRawCached = unstable_cache(
    async () => {
        return queryDb(async (db) => {
            const rows = await db.select().from(patterns).orderBy(desc(patterns.createdAt))
            return rows.map((r) => ({
                id: r.id,
                name: r.name,
                studio: r.studio,
                categories: r.categories ?? [],
                // 兜底：极少数情况下 images 为空数组时保持空
                imageKeys: r.images ?? [],
                fileKey: r.fileUrl ?? null,
                fileName: r.fileName ?? null,
                note: r.note,
            }))
        })
    },
    ["patterns-list"],
    { revalidate: 30, tags: ["patterns"] },
)

export async function getAllPatterns(): Promise<GalleryPattern[]> {
    const rows = await getAllPatternsRawCached()
    return rows.map((r) => {
        const imageUrls = r.imageKeys.map((k) => toSignedUrl(k)).filter(Boolean)
        return {
            id: r.id,
            name: r.name,
            studio: r.studio,
            categories: r.categories,
            imageUrls,
            thumbnailUrl: imageUrls[0] ?? "",
            fileUrl: r.fileKey ? toSignedUrl(r.fileKey) : null,
            fileName: r.fileName,
            note: r.note,
        }
    })
}

const getAllTagsCached = unstable_cache(
    async () => {
        return queryDb(async (db) => {
            const rows = await db
                .select()
                .from(tags)
                .orderBy(asc(tags.sortOrder), asc(tags.id))
            return rows.map((t) => ({
                id: t.id,
                name: t.name,
                color: t.color,
                sortOrder: t.sortOrder,
            }))
        })
    },
    ["tags-list"],
    { revalidate: 60, tags: ["tags"] },
)

export type TagRecord = {
    id: number
    name: string
    color: string
    sortOrder: number
}

export async function getAllTags(): Promise<TagRecord[]> {
    return getAllTagsCached()
}

export async function getTagInfos(): Promise<TagInfo[]> {
    const rows = await getAllTags()
    return rows.map((t) => ({ name: t.name, color: t.color as TagInfo["color"] }))
}