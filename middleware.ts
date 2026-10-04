import { NextRequest, NextResponse } from "next/server"

/**
 * 跳过所有 OPTIONS 预检请求，让它们直接到达 serverless 函数处理。
 * 不在 Edge Middleware 里处理 CORS，避免 MIDDLEWARE_INVOCATION_FAILED 问题。
 */
export function middleware(request: NextRequest) {
    return NextResponse.next()
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
