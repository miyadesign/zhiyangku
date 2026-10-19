import { redirect } from "next/navigation"
import { PatternSpreadsheet } from "@/components/pattern-spreadsheet"
import { isAdmin } from "@/lib/admin-auth"
import { getAllPatterns, getAllTags } from "@/lib/queries"

export const dynamic = "force-dynamic"

export default async function PatternTablePage() {
  if (!(await isAdmin())) redirect("/")
  const [patterns, tags] = await Promise.all([getAllPatterns(), getAllTags()])
  return <PatternSpreadsheet initialPatterns={patterns} initialTags={tags} />
}
