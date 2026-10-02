import { tagColorClasses } from "@/lib/constants"
import { cn } from "@/lib/utils"

export function CategoryBadge({
  category,
  color,
  className,
}: {
  category: string
  /** 标签颜色 key（来自数据库），缺省回退中性色 */
  color?: string
  className?: string
}) {
  const c = tagColorClasses(color)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        c.bg,
        c.text,
        className,
      )}
    >

      {category}
    </span>
  )
}
