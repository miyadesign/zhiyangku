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

        // 完整 URL 直接重定向（兼容历史 Cloudinary URL 或已是签名 URL 的情况）
        if (/^https?:\/\//i.test(key)) {
            return NextResponse.redirect(key)
        }

        const signed = signUrl(key)
        if (wantDownload) {
            // 下载模式：用 fetch 中转加 Content-Disposition，避免 OSS 直链无法自定义文件名
            const upstream = await fetch(signed, { cache: "no-store" })
            if (!upstream.ok) {
                return NextResponse.json({ error: `OSS 返回 ${upstream.status}` }, { status: upstream.status })
            }
            const filename = request.nextUrl.searchParams.get("filename") || key.split("/").pop() || "download"
            const encoded = encodeURIComponent(filename)
            const headers = new Headers()
            headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream")
            headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encoded}`)
            headers.set("Cache-Control", "public, max-age=3600")
            return new NextResponse(upstream.body, { status: 200, headers })
        }

        return NextResponse.redirect(signed)
    } catch (error) {
        console.error("[file] error:", error)
        return NextResponse.json({ error: "读取文件失败" }, { status: 500 })
    }
}