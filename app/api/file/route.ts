import { type NextRequest, NextResponse } from "next/server"
import { signUrl } from "@/lib/oss"

// 兼容性代理：极少数场景下前端可能只拿到 key（比如未来去掉 queries 层的预签名）。
// 这里根据 key 直接 302 到 OSS 签名 URL，避免前端破图。
//
// 大多数情况下，前端拿到的 thumbnailUrl/fileUrl 已经是完整的签名 URL（见 lib/queries.ts toSignedUrl），
// 不会经过这个路由。
export async function GET(request: NextRequest) {
    try {
        const key = request.nextUrl.searchParams.get("key")
        const wantDownload = request.nextUrl.searchParams.get("download") === "1"

        if (!key) {
            return NextResponse.json({ error: "缺少 key" }, { status: 400 })
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
        const upstream = await fetch(signed, { cache: "no-store" })
        if (!upstream.ok) {
            return NextResponse.json({ error: `OSS 返回 ${upstream.status}` }, { status: upstream.status })
        }
        {
            const filename = request.nextUrl.searchParams.get("filename") || key.split("/").pop() || "download"
            const headers = new Headers()
            headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream")
            headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=3600")
            if (wantDownload) {
                headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
            }
            return new NextResponse(upstream.body, { status: 200, headers })
        }
    } catch (error) {
        console.error("[file] error:", error)
        return NextResponse.json({ error: "读取文件失败" }, { status: 500 })
    }
}
