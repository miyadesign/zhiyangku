// 一次性脚本：执行 migrations/001-merge-images.sql
// 用法：DATABASE_URL_3=... npx tsx scripts/run-migration.ts public/migrations/001-merge-images.sql
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"

async function main() {
  const file = process.argv[2] ?? "public/migrations/001-merge-images.sql"
  const sql = readFileSync(resolve(file), "utf-8")

  const connectionString =
    process.env.DATABASE_URL_3 ||
    process.env.DIRECT_URL_2 ||
    process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is not set")

  // neon 的 client 调用允许多语句模板字符串
  const client = neon(connectionString) as unknown as (parts: TemplateStringsArray) => Promise<unknown>
  const out = await client([sql] as unknown as TemplateStringsArray)
  console.log("[migration] OK:", file, "→", out)
}

main().catch((e) => {
  console.error("[migration] FAILED:", e)
  process.exit(1)
})