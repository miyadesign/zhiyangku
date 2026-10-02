/**
 * Next.js 应用启动钩子（Next 14+ / 15+ / 16+ 默认开启）。
 *
 * 问题：开发机的 macOS 设置了系统代理（scutil --proxy），Node 全局 fetch（undici）
 * 走 HTTPS 时被代理 403 / 拦截，导致 @neondatabase/serverless 连不上 Neon。
 *
 * 方案：
 *   1) 在 server runtime 启动前注入一个**走直连的 zero-dep HTTPS fetch** 到
 *      globalThis.__NEON_DIRECT_FETCH__。
 *   2) lib/db/index.ts 模块加载时把它取出来挂到 neonConfig.fetchFunction。
 *
 * 直连 fetch **必须只走 server bundle**（它用 net/tls），所以代码直接写在本文件里，
 * 没有任何 client import 链能引到。
 */
import * as net from "net"
import * as tls from "tls"
import dns from "dns/promises"
import { URL } from "url"

async function readFullResponse(
    socket: net.Socket,
): Promise<{
    status: number
    statusText: string
    headers: Record<string, string[]>
    body: Buffer
}> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        socket.on("data", (chunk: Buffer) => chunks.push(chunk))
        socket.on("end", () => {
            const full = Buffer.concat(chunks)
            const headerEnd = full.indexOf("\r\n\r\n")
            if (headerEnd < 0) {
                reject(new Error("directFetch: 响应缺少 header 终止符"))
                return
            }
            const headStr = full.slice(0, headerEnd).toString("utf8")
            const body = full.slice(headerEnd + 4)
            const lines = headStr.split("\r\n")
            const statusLine = lines.shift() ?? ""
            const m = statusLine.match(/^HTTP\/(\d\.\d)\s+(\d+)\s*(.*)$/)
            const status = m ? parseInt(m[2], 10) : 0
            const statusText = m ? m[3] : ""
            const headers: Record<string, string[]> = {}
            for (const line of lines) {
                const idx = line.indexOf(":")
                if (idx < 0) continue
                const key = line.slice(0, idx).trim().toLowerCase()
                const value = line.slice(idx + 1).trim()
                if (!headers[key]) headers[key] = []
                headers[key].push(value)
            }
            resolve({ status, statusText, headers, body })
        })
        socket.on("error", reject)
    })
}

async function directFetch(
    urlString: string,
    init?: RequestInit | { headers?: Record<string, string>; timeoutMs?: number },
): Promise<Response> {
    const url = new URL(urlString)
    if (url.protocol !== "https:") {
        throw new Error(`directFetch 仅支持 https://，收到 ${url.protocol}`)
    }
    const hostname = url.hostname
    const port = url.port ? Number(url.port) : 443
    const path = url.pathname + url.search

    const initHeaders =
        init && "headers" in init
            ? (init.headers as Record<string, string>)
            : null
    const method =
        init && "method" in init ? String(init.method) : "GET"
    const body =
        init && "body" in init
            ? (init.body as string | Uint8Array | undefined)
            : undefined
    const timeoutMs =
        init && "timeoutMs" in init
            ? Number((init as { timeoutMs?: number }).timeoutMs)
            : 15_000

    const reqHeaders: Record<string, string> = {
        host: `${hostname}:${port}`,
        accept: "*/*",
        connection: "close",
        ...(initHeaders || {}),
    }
    if (body && !reqHeaders["content-length"]) {
        const buf =
            typeof body === "string" ? Buffer.from(body) : Buffer.from(body)
        reqHeaders["content-length"] = String(buf.length)
    }

    const { address } = await dns.lookup(hostname)
    const socket = net.createConnection({ host: address, port })
    socket.setNoDelay(true)

    const tlsSocket = await new Promise<tls.TLSSocket>((resolve, reject) => {
        const t = tls.connect({
            socket,
            servername: hostname,
            host: hostname,
            rejectUnauthorized: true,
        })
        t.once("secureConnect", () => resolve(t))
        t.once("error", reject)
    })

    const timer = setTimeout(() => {
        tlsSocket.destroy(new Error(`directFetch: ${timeoutMs}ms timeout`))
    }, timeoutMs)
    timer.unref?.()

    const headerLines = Object.entries(reqHeaders)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n")
    const bodyBuf =
        body && typeof body === "string"
            ? Buffer.from(body, "utf8")
            : body
                ? Buffer.from(body as Uint8Array)
                : Buffer.alloc(0)

    // 必须先挂 data 监听器，再 write，否则响应可能丢失
    const respP = readFullResponse(tlsSocket)
    // 头部是 ASCII（Key=安全），直接 string 写；body 是 UTF-8 JSON，必须 Buffer 写
    // 否则 socket.write 默认 UTF-8 encoding 会把 binary string 重新编码，破坏多字节字符
    tlsSocket.write(`${method} ${path} HTTP/1.1\r\n${headerLines}\r\n\r\n`)
    if (bodyBuf.length > 0) tlsSocket.write(bodyBuf)

    const { status, statusText, headers: respHeaders, body: respBody } =
        await respP
    clearTimeout(timer)
    tlsSocket.destroy()

    const headerInit: [string, string][] = []
    for (const [k, arr] of Object.entries(respHeaders)) {
        for (const v of arr) headerInit.push([k, v])
    }
    return new Response(respBody, {
        status,
        statusText,
        headers: headerInit,
    })
}

export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return

    delete process.env.HTTP_PROXY
    delete process.env.HTTPS_PROXY
    delete process.env.http_proxy
    delete process.env.https_proxy
    delete process.env.ALL_PROXY
    delete process.env.all_proxy
    delete process.env.NO_PROXY
    delete process.env.no_proxy

    ;(
        globalThis as unknown as { __NEON_DIRECT_FETCH__: typeof fetch }
    ).__NEON_DIRECT_FETCH__ = directFetch as unknown as typeof fetch

    // OSS 连接池预热：进程起来就付 1 次 SSL 握手成本，让首次上传 0 等待
    // 异步执行，不阻塞 register() 返回
    import("./lib/oss")
        .then((m) => m.warmupOss())
        .catch(() => undefined)
}