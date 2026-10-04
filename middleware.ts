import { NextRequest, NextResponse } from "next/server"

/**
 * Vercel Edge Middleware 在 serverless 函数之前运行，OPTIONS 会先到 Edge。
 * 为避免 Edge → cold start 的 2s 延迟，我们让 OPTIONS 路径跳过中间件，
 * 直接在 route.ts 里处理（CORS preflight 由服务端返回 204）。
 *
 * 如果 Edge Middleware 出问题（如 MIDDLEWARE_INVOCATION_FAILED），
 * 注释掉下面一行即可让请求直达 serverless 函数。
 */
export function middleware(request: NextRequest) {
    return NextResponse.next()
}

export const config = {
    // 匹配所有路径（方便未来扩展）
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
