import { NextRequest, NextResponse } from "next/server"

/**
 * 在 Vercel Edge 层统一处理 CORS preflight（OPTIONS）。
 *
 * 为什么不写在 /api/sign-upload/route.ts 里：
 * - Next.js serverless 函数里的 OPTIONS 需要经过 Edge → cold start → 函数启动
 * - 跨洲时 cold start ~2s，OPTIONS 经常 504 超时
 * - Middleware 运行在 Edge 节点（毫秒级响应），直接返回 204，不走函数
 */
export function middleware(request: NextRequest) {
    // 只拦截 OPTIONS 请求
    if (request.method === "OPTIONS") {
        return new NextResponse(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "3600",
            },
        })
    }
    // 非 OPTIONS 继续正常处理
    return NextResponse.next()
}

export const config = {
    matcher: ["/api/sign-upload/:path*"],
}
