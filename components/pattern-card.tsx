"use client"

import { Pencil, Trash2 } from "lucide-react"
import { CategoryBadge } from "@/components/category-badge"
import { fileSrc, imgOnError, type GalleryPattern } from "@/lib/gallery-types"

export function PatternCard({
  pattern,
  tagColors,
  onOpen,
  onEdit,
  onDelete,
}: {
  pattern: GalleryPattern
  tagColors: Record<string, string>
  onOpen: (pattern: GalleryPattern) => void
  onEdit?: (pattern: GalleryPattern) => void
  onDelete?: (pattern: GalleryPattern) => void
}) {
  const manageable = !!onEdit || !!onDelete
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
      <div className="relative">
        <button
          type="button"
          onClick={() => onOpen(pattern)}
          className="block w-full cursor-zoom-in text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`查看 ${pattern.name} 高清纸样`}
        >
          {/* 移动端 aspect-square（更高），PC 端 aspect-[4/3] */}
          <div className="relative aspect-square overflow-hidden bg-muted md:aspect-[4/3]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileSrc(pattern.thumbnailUrl) || "/placeholder.svg"}
              alt={`${pattern.name} 纸样预览`}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
              onError={imgOnError}
            />
          </div>
        </button>

        {manageable && (
          <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(pattern)}
                aria-label={`编辑 ${pattern.name}`}
                className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Pencil className="size-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(pattern)}
                aria-label={`删除 ${pattern.name}`}
                className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-background/90 text-destructive shadow-sm backdrop-blur transition-colors hover:bg-destructive hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-pretty text-sm font-medium leading-snug text-card-foreground">
            {pattern.name}
          </h3>
        </div>

        {/* 所有端：工作室 + 标签同行（studio 左 / 标签右）。
        移动端徽章单行不换行 + 小字号；PC 端徽章可换行但仍与 studio 同行。 */}
        <div className="flex items-center justify-between gap-2">
          <p className="shrink-0 text-xs text-muted-foreground">{pattern.studio}</p>
          <div className="flex flex-nowrap justify-end gap-1 overflow-hidden md:flex-wrap md:overflow-visible">
            {pattern.categories.map((cat) => (
              <CategoryBadge
                key={cat}
                category={cat}
                color={tagColors[cat]}
                className="px-1.5 py-0 text-[10px] whitespace-nowrap md:px-2 md:py-0.5 md:text-xs md:whitespace-normal"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
