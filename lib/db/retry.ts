/**
 * 包装数据库查询，对瞬时错误自动重试。
 *
 * 适用场景：
 *   - Neon serverless RST 掉 TCP 连接
 *   - 任何网络抖动、DNS 重解析
 *
 * 重试策略：最多 4 次，指数退避 300ms / 800ms / 1800ms / 3500ms。
 * 加上每次 queryDb 内部"全新连接"，几乎可以保证冷启动 1-2 次内成功。
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
