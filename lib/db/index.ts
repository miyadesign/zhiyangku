import "server-only"
import { drizzle } from "drizzle-orm/neon-http"
import { neon, neonConfig } from "@neondatabase/serverless"
import * as schema from "./schema"

function getConnectionString(): string {
    const connectionString =
        process.env.DATABASE_URL_3 ||
        process.env.DIRECT_URL_2 ||
        process.env.DATABASE_URL

    if (!connectionString) {
        throw new Error("DATABASE_URL is not set")
    }
    return connectionString
}

/**
 * Neon HTTP 适配器（dev 环境）。
 *
 * 关键问题：开发机的 macOS 设置了系统代理，Node 全局 fetch（undici）走 HTTPS
 * 时被代理 403 / 拦截，导致 @neondatabase/serverless 连不上 Neon。
 *
 * 解决方案：instrumentation.ts 注入一个 zero-dep 的直连 fetch 到 globalThis，
 * 我们在 module load 时取出来挂到 neonConfig.fetchFunction 上，Neon 的所有
 * HTTPS 请求都走它，不经过系统代理。
 */
let sql: ReturnType<typeof neon> | undefined

function getSql() {
    if (sql) return sql

    const connectionString = getConnectionString()
    const injectedFetch: typeof fetch | undefined = (
        globalThis as unknown as { __NEON_DIRECT_FETCH__?: typeof fetch }
    ).__NEON_DIRECT_FETCH__

    if (injectedFetch) {
        neonConfig.fetchFunction = injectedFetch
    }

    sql = neon(connectionString, { fullResults: false })
    return sql
}

/** 直接 SQL 访问，避免 Drizzle ORM 的 INSERT/UPDATE 在某些版本下出现的 param 顺序错位问题。
 *  - SELECT 仍然走 Drizzle（read 路径稳定）
 *  - write（INSERT/UPDATE/DELETE）走这里
 */
// Keep the tagged-template API while deferring environment validation/client
// creation until a request actually executes SQL.
export const sqlDb = new Proxy((() => undefined) as unknown as ReturnType<typeof neon>, {
    apply(_target, thisArg, args) {
        return Reflect.apply(getSql(), thisArg, args)
    },
})

/** 浅位 db 占位（保持 lib/queries.ts 的 import 不变；调用方都走 queryDb） */
export const db = {
    select: (..._args: unknown[]) => {
        throw new Error(
            "[db] 请用 queryDb() 替代直接 db.select()。",
        )
    },
}

export type QueryDbInstance = ReturnType<typeof drizzle<typeof schema>>

export async function queryDb<T>(
    fn: (db: QueryDbInstance) => Promise<T>,
): Promise<T> {
    const { queryWithRetry } = await import("./retry")
    let safeHost = "<unknown>"
    try {
        const u = new URL(getConnectionString())
        safeHost = u.host
    } catch {
        /* ignore */
    }
    return queryWithRetry(async () => {
        try {
            // neon()'s generic defaults are wider than drizzle-neon's default
            // query result types; runtime result mode is fixed to false above.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const instance = drizzle(getSql() as any, { schema })
            return await fn(instance)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            const wrapped = new Error(
                `[queryDb] Neon HTTP 查询失败 (host=${safeHost}): ${msg}`,
            )
            ;(wrapped as Error & { cause?: unknown }).cause = e
            throw wrapped
        }
    })
}
