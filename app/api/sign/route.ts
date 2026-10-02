import { type NextRequest, NextResponse } from "next/server"
import { signUrl } from "@/lib/oss"

// 为 key 生成 OSS 临时签名 URL
// 大多数情况下不需要这个接口（lib/queries.ts 已经在服务端把 key 转成签名 URL），
// 仅供那些 key 在客户端才知道的场景（例如服务端不参与 SSR 的纯客户端组件）使用。
export async function GET(request: NextRequest) {
    try {
        const key = request.nextUrl.searchParams.get("key")
        const expires = Number(request.nextUrl.searchParams.get("expires") || 3600)
        if (!key) {
            return NextResponse.json({ error: "缺少 key" }, { status: 400 })
        }
        // 完整 URL 直接返回
        if (/^https?:\/\//i.test(key)) {
            return NextResponse.json({ url: key })
        }
        const url = signUrl(key, Math.min(Math.max(expires, 60), 86400))
        return NextResponse.json({ url })
    } catch (error) {
        console.error("[sign] error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "签名失败" },
            { status: 500 },
        )
    }
}