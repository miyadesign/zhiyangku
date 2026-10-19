import { redirect } from "next/navigation"
import { PatternSpreadsheet } from "@/components/pattern-spreadsheet"
import { isAdmin } from "@/lib/admin-auth"
import { getAllPatterns, getAllTags, getGalleryRevision } from "@/lib/queries"

export const dynamic = "force-dynamic"

export default async function PatternTablePage() {
  if (!(await isAdmin())) redirect("/")
  const [patterns, tags, revision] = await Promise.all([
    getAllPatterns(),
    getAllTags(),
    getGalleryRevision(),
  ])
  return <PatternSpreadsheet initialPatterns={patterns} initialTags={tags} initialRevision={revision} />
}
