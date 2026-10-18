import { type NextRequest, NextResponse } from "next/server"
import { signPutUrl } from "@/lib/oss-sign"

// 设计：客户端把文件以 application/octet-stream 直接 POST 到这里（不要 multipart）。
//
// 中转路径使用 Web fetch 和 OSS 预签名 PUT 流式转发，避免 Cloudflare
// Workers 下 ali-oss Node Agent 的响应处理不兼容，也不把文件整体读入内存。
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

        const tHeaders = Date.now() - tStart
        const tPut = Date.now()
        const contentType = "application/octet-stream"
        const upstream = await fetch(signPutUrl(key, 300, contentType), {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: request.body,
            signal: AbortSignal.timeout(110_000),
            cache: "no-store",
            // Node fetch requires this for streaming bodies; Workers also supports Web streams.
            duplex: "half",
        } as RequestInit & { duplex: "half" })
        if (!upstream.ok) {
            const detail = (await upstream.text().catch(() => "")).slice(0, 500)
            throw new Error(`OSS PUT 失败 (${upstream.status})${detail ? `: ${detail}` : ""}`)
        }
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
