import { type NextRequest, NextResponse } from "next/server"
import { Readable } from "stream"
import { oss } from "@/lib/oss"

// 设计：客户端把文件以 application/octet-stream 直接 POST 到这里（不要 multipart）。
//
// 中转路径。用 Node 原生 Web stream → Readable → oss.putStream 直接转发：
//   - 浏览器不需要编 multipart，省一次编码
//   - Next.js 不解析 multipart，省一次解码
//   - 不调 arrayBuffer() 整体加载到内存：130KB 不影响，10MB 文件就不会爆内存了
//   - putStream 走单 PUT（不是 chunked multi-part），SDK 默认 keep-alive 复用连接
//   - 整个流式 pipeline：客户端 → Next.js → OSS 一跳转发，端到端延迟更低
//
// 性能日志：服务端打印各阶段耗时（接收头/流启动/put完成/总）便于排查瓶颈。
// 协议：body 是原始 file bytes；x-filename / x-folder / x-oss-key 头携带元信息。
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
    const tStart = Date.now()
    try {
        const rawName = request.headers.get("x-filename")
        const filename = rawName ? decodeURIComponent(rawName) : "upload"
        const isFiles = request.headers.get("x-folder") === "files"
        const folder: "images" | "files" = isFiles ? "files" : "images"
        const contentLength = Number(request.headers.get("content-length") || 0)

        if (!request.body) {
            return NextResponse.json({ error: "未提供文件" }, { status: 400 })
        }

        // key 在客户端已经按 lib/direct-upload.ts 的 buildKey 规则生成；服务端只信任 header
        let key = request.headers.get("x-oss-key")
        if (!key || !key.startsWith(`patterns/${folder}/`)) {
            const baseName = filename.replace(/[/\\:*?"<>|]/g, "_")
            const ext = baseName.match(/\.[^.]+$/)?.[0] || (folder === "images" ? ".png" : "")
            const stamp = Date.now().toString(36)
            const rand = Math.random().toString(36).slice(2, 8)
            key = `patterns/${folder}/${stamp}_${rand}${ext}`
        }

        // Web ReadableStream → Node Readable（ali-oss SDK 用 Node stream 接口）
        // 从 Next.js 的 Web stream 转到 Node stream 是 zero-copy 的（同底层）
        const nodeStream = Readable.fromWeb(request.body as unknown as import("node:stream/web").ReadableStream)

        const tHeaders = Date.now() - tStart
        const tPut = Date.now()
        // ali-oss 类型签名要求 PutStreamOptions 至少含一个 key；但允许只传部分字段
        await oss.putStream(key, nodeStream, {
            ...(contentLength > 0 ? { contentLength } : {}),
        } as never)
        const msPut = Date.now() - tPut
        const msTotal = Date.now() - tStart
        console.log(
            `[upload] ${(contentLength / 1024).toFixed(1)}KB ${folder}/${key.split("/").pop()} headers=${tHeaders}ms put=${msPut}ms total=${msTotal}ms`,
        )

        const res = NextResponse.json({ key })
        // Server-Timing 让浏览器在 DevTools Network 里能看到服务端各阶段耗时
        res.headers.set(
            "Server-Timing",
            `headers;dur=${tHeaders},put;dur=${msPut},total;dur=${msTotal}`,
        )
        return res
    } catch (error) {
        console.error("[upload] error:", {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : undefined,
            stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
        })
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "上传失败" },
            { status: 500 },
        )
    }
}