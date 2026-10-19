import { getAllPatterns, getAllTags } from "@/lib/queries"
import { Gallery } from "@/components/gallery"
import { isAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export default async function Page() {
  // 并行执行：两个查询互不依赖，各自走独立 Client，节省 100-200ms 串行握手开销。
  // 之前的串行在 Neon 冷启动时容易把"建立连接 + 查询" 总耗时推到 10s 超时。
  const [patterns, tags, admin] = await Promise.all([
    getAllPatterns(),
    getAllTags(),
    isAdmin(),
  ])

  return <Gallery patterns={patterns} tags={tags} initialIsAdmin={admin} />
}
