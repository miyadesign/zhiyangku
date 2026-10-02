/**
 * 直接测 Neon 连接，绕过 Next.js dev server 框架，最快定位是 DNS / 网络 / 凭证哪个出问题。
 *
 * 用法：
 *   1) node --env-file=.env.local scripts/test-neon-connection.mjs
 *   2) 或者在终端里先 export DATABASE_URL=... 再 node scripts/test-neon-connection.mjs
 */
import pg from "pg"

const url = process.env.DATABASE_URL
if (!url) {
    console.error("DATABASE_URL is not set. 用 --env-file=.env.local 或先 export")
    process.exit(1)
}

console.log("URL host:", new URL(url).host)
console.log("SSL mode:", new URL(url).searchParams.get("sslmode"))

const c = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 15_000,
})

try {
    console.log("Connecting...")
    await c.connect()
    console.log("Connected!")
    const r = await c.query("SELECT now() as t, current_database() as db, version()")
    console.log("Result:", r.rows[0])
    await c.end()
    console.log("Done")
} catch (e) {
    console.error("FAIL:", e.message)
    console.error("Code:", e.code)
    if (e.cause) console.error("Cause:", e.cause)
    process.exit(1)
}