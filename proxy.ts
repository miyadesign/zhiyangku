import { NextRequest, NextResponse } from "next/server"

/**
 * Next.js 16 迁移：middleware.ts → proxy.ts
 * 
 * 注意：这个文件仅作占位。Next.js 16 Edge Runtime 对 Node.js 模块有严格限制，
 * 如果这里导入任何 Node.js 模块（如 net/tls/crypto），会导致 MIDDLEWARE_INVOCATION_FAILED。
 * 目前上传和签名都已通过 serverless 函数处理，无需 Edge 中间件逻辑。
 */
export function proxy(request: NextRequest) {
    return NextResponse.next()
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
