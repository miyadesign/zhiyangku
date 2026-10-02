// 临时调试：看 patterns 表的 column 顺序
import { patterns } from "../lib/db/schema.ts"

const cols = patterns[Symbol.for("drizzle:Columns")]
console.log("[1] Object.keys(cols):")
console.log(Object.keys(cols))
console.log()
console.log("[2] Object.entries(cols) (each is [key, column]):")
for (const [key, col] of Object.entries(cols)) {
    console.log(`  ${key} -> name=${col.name} type=${col.entityKind}`)
}
process.exit(0)