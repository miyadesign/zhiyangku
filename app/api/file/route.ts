import { type NextRequest, NextResponse } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { signUrl } from "@/lib/oss"

type CacheRuntime = typeof globalThis & {
    caches?: CacheStorage & { default?: Cache }
}

// 兼容性代理：极少数场景下前端可能只拿到 key（比如未来去掉 queries 层的预签名）。
// 这里根据 key 直接 302 到 OSS 签名 URL，避免前端破图。
//
// 大多数情况下，前端拿到的 thumbnailUrl/fileUrl 已经是完整的签名 URL（见 lib/queries.ts toSignedUrl），
// 不会经过这个路由。
export async function GET(request: NextRequest) {
    try {
        const key = request.nextUrl.searchParams.get("key")
        const wantDownload = request.nextUrl.searchParams.get("download") === "1"
        const wantPreview = request.nextUrl.searchParams.get("preview") === "1"

        if (!key) {
            return NextResponse.json({ error: "缺少 key" }, { status: 400 })
        }

        // 图片 key 不包含短期签名，可用稳定 URL 作为边缘缓存键。
        // 只缓存公开展示的纸样图片；电子文件和下载响应仍不进入公共缓存。
        const cacheableImage = !wantDownload && key.startsWith("patterns/images/")
        let cloudflareContext: ReturnType<typeof getCloudflareContext> | undefined
        try {
            cloudflareContext = getCloudflareContext()
        } catch {
            // 本地 next dev 使用普通 fetch，不支持 Cloudflare 图片变换。
        }
        const runtimeContext = cloudflareContext?.ctx as
            | { waitUntil: (promise: Promise<unknown>) => void }
            | undefined
        const cache = cloudflareContext ? (globalThis as CacheRuntime).caches?.default : undefined
        const cacheKeyUrl = new URL(`/api/file?key=${encodeURIComponent(key)}`, request.url)
        if (wantPreview) cacheKeyUrl.searchParams.set("preview", "1")
        const cacheKey = cacheableImage ? new Request(cacheKeyUrl) : null

        if (cache && cacheKey) {
            try {
                const cached = await cache.match(cacheKey)
                if (cached) {
                    const response = new NextResponse(cached.body, cached)
                    response.headers.set("X-Image-Cache", "HIT")
                    return response
                }
            } catch (error) {
                console.warn("[file] edge cache read failed:", error)
            }
        }

        // 完整 URL 直接重定向（兼容历史 Cloudinary URL）。OSS URL 提取 key 后重新签名。
        if (/^https?:\/\//i.test(key)) {
            const url = new URL(key)
            if (!url.hostname.endsWith(".aliyuncs.com")) return NextResponse.redirect(key)
            const objectKey = decodeURIComponent(url.pathname.replace(/^\//, ""))
            const target = new URL("/api/file", request.url)
            target.searchParams.set("key", objectKey)
            if (wantDownload) {
                target.searchParams.set("download", "1")
                const filename = request.nextUrl.searchParams.get("filename")
                if (filename) target.searchParams.set("filename", filename)
            }
            return NextResponse.redirect(target)
        }

        const signed = signUrl(key)
        // 同源中转 OSS 内容：Wi-Fi 网络无需直接访问 OSS 域名，且签名每次请求都会刷新。
        const fetchOptions: RequestInit & {
            cf?: { image: { width: number; height: number; fit: "cover"; quality: number; format: "auto" } }
        } = { cache: "no-store" }
        if (wantPreview && cacheableImage && cloudflareContext) {
            fetchOptions.cf = {
                image: { width: 480, height: 480, fit: "cover", quality: 70, format: "auto" },
            }
        }

        let upstream: Response
        let previewTransformed = false
        if (wantPreview && cacheableImage && cloudflareContext) {
            try {
                upstream = await fetch(signed, fetchOptions)
                previewTransformed = upstream.ok
                if (!upstream.ok) {
                    console.warn(`[file] preview transform failed (${upstream.status}), using original image`)
                    upstream = await fetch(signed, { cache: "no-store" })
                }
            } catch (error) {
                // 图片变换不可用或达到免费额度时回退原图，保证图库仍可用。
                console.warn("[file] preview transform unavailable, using original image:", error)
                upstream = await fetch(signed, { cache: "no-store" })
            }
        } else {
            upstream = await fetch(signed, { cache: "no-store" })
        }
        if (!upstream.ok) {
            return NextResponse.json({ error: `OSS 返回 ${upstream.status}` }, { status: upstream.status })
        }
        {
            const filename = request.nextUrl.searchParams.get("filename") || key.split("/").pop() || "download"
            const headers = new Headers()
            headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream")
            if (cacheableImage) {
                headers.set("Cache-Control", "public, max-age=300, s-maxage=86400")
                headers.set("X-Image-Cache", cache ? "MISS" : "BYPASS")
                if (wantPreview) headers.set("X-Image-Transform", previewTransformed ? "applied" : "fallback")
            } else {
                headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=3600")
            }
            if (wantDownload) {
                headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
            }
            const response = new NextResponse(upstream.body, { status: 200, headers })

            if (cache && cacheKey && cacheableImage) {
                try {
                    runtimeContext?.waitUntil(
                        cache.put(cacheKey, response.clone()).catch((error) => {
                            console.warn("[file] edge cache write failed:", error)
                        }),
                    )
                } catch {
                    // 本地 next dev 没有 Worker 生命周期 context，仍正常返回图片。
                }
            }

            return response
        }
    } catch (error) {
        console.error("[file] error:", error)
        return NextResponse.json({ error: "读取文件失败" }, { status: 500 })
    }
}
