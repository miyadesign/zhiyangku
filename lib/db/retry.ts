/**
 * 包装数据库查询，对瞬时错误自动重试。
 *
 * 适用场景：
 *   - Neon serverless / fetch 请求中途断开（例如 "Connection closed"）
 *   - 任何网络抖动、DNS 重解析
 *
 * 重试策略：最多 4 次，指数退避 300ms / 800ms / 1800ms / 3500ms。
 * Neon HTTP 每次查询都会发起 HTTP 请求；遇到可恢复的网络断连时重新执行查询。
 */
export async function queryWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const delays = [300, 800, 1800, 3500] // ms
    let lastErr: unknown
    for (let attempt = 0; attempt <= delays.length; attempt++) {
        try {
            return await fn()
        } catch (e) {
            lastErr = e
            if (!isRetryableError(e)) throw e
            if (attempt === delays.length) break
            await sleep(delays[attempt])
        }
    }
    throw lastErr
}

function isRetryableError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e)
    const cause = e && typeof e === "object" && "cause" in e ? (e as { cause?: unknown }).cause : null
    const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : ""
    const text = `${msg} ${causeMsg}`.toLowerCase()
    // pg v8 拨号超时消息是 "timeout expired"（不是 libpq 的 "timeout exceeded when trying to connect"）
    return (
        text.includes("connection terminated") ||
        text.includes("connection terminated unexpectedly") ||
        text.includes("connection closed") ||
        text.includes("closed connection") ||
        text.includes("socket closed") ||
        text.includes("econnreset") ||
        text.includes("econnrefused") ||
        text.includes("enotfound") ||
        text.includes("etimedout") ||
        text.includes("timeout expired") ||
        text.includes("timeout exceeded when trying to connect") ||
        text.includes("socket hang up") ||
        text.includes("fetch failed")
    )
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
}
