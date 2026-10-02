"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, Minus, Plus, RotateCcw, X } from "lucide-react"
import { CategoryBadge } from "@/components/category-badge"
import { fileSrc, imgOnError, type GalleryPattern } from "@/lib/gallery-types"
import { cn } from "@/lib/utils"

const MIN_SCALE = 1
const MAX_SCALE = 4

export function PatternModal({
  pattern,
  tagColors,
  onClose,
  onDownload,
}: {
  pattern: GalleryPattern | null
  tagColors: Record<string, string>
  onClose: () => void
  onDownload: (pattern: GalleryPattern) => void
}) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })

  const resetView = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  // 切换纸样时重置视图
  useEffect(() => {
    resetView()
  }, [pattern, resetView])

  // 键盘 ESC 关闭 + 锁定滚动
  useEffect(() => {
    if (!pattern) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [pattern, onClose])

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

  const zoomBy = (delta: number) => {
    setScale((s) => {
      const next = clampScale(Number((s + delta).toFixed(2)))
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 })
      return next
    })
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.25 : 0.25
    zoomBy(delta)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return
    dragging.current = true
    last.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - last.current.x
    const dy = e.clientY - last.current.y
    last.current = { x: e.clientX, y: e.clientY }
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }))
  }

  const endDrag = () => {
    dragging.current = false
  }

  if (!pattern) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${pattern.name} 尺码表`}
    >
      {/* 遮罩 */}
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
      />

      {/* 内容 */}
      <div className="relative z-10 flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:flex-row">
        {/* 尺码表图像区 */}
        <div className="relative flex-1 overflow-hidden bg-muted">
          {pattern.sizeChartUrl ? (
            <>
              <div
                className={cn(
                  "flex h-64 w-full items-center justify-center overflow-hidden select-none md:h-[70vh]",
                  scale > 1
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-zoom-in",
                )}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerLeave={endDrag}
                onDoubleClick={() => (scale > 1 ? resetView() : zoomBy(1))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileSrc(pattern.sizeChartUrl) || "/placeholder.svg"}
                  alt={`${pattern.name} 尺码表`}
                  draggable={false}
                  className="max-h-full max-w-full object-contain transition-transform duration-75"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  }}
                />
              </div>

              {/* 缩放控制 */}
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/90 p-1 shadow-sm backdrop-blur">
                <button
                  type="button"
                  onClick={() => zoomBy(-0.5)}
                  disabled={scale <= MIN_SCALE}
                  className="inline-flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                  aria-label="缩小"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => zoomBy(0.5)}
                  disabled={scale >= MAX_SCALE}
                  className="inline-flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                  aria-label="放大"
                >
                  <Plus className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={resetView}
                  className="inline-flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
                  aria-label="重置视图"
                >
                  <RotateCcw className="size-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex h-64 w-full items-center justify-center p-6 text-center md:h-[70vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileSrc(pattern.thumbnailUrl) || "/placeholder.svg"}
                alt={`${pattern.name} 纸样预览`}
                className="max-h-full max-w-full object-contain opacity-90"
                onError={imgOnError}
              />
            </div>
          )}
        </div>

        {/* 信息区 */}
        <div className="flex w-full flex-col gap-4 border-t border-border p-5 md:w-72 md:shrink-0 md:border-l md:border-t-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-balance font-serif text-lg font-medium leading-snug text-card-foreground">
                {pattern.name}
              </h2>
              <p className="text-sm text-muted-foreground">{pattern.studio}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 纸样缩略图 */}
          <div className="overflow-hidden rounded-lg border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileSrc(pattern.thumbnailUrl) || "/placeholder.svg"}
              alt={`${pattern.name} 纸样预览`}
              className="aspect-[4/3] w-full object-cover"
              onError={imgOnError}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {pattern.categories.map((cat) => (
              <CategoryBadge key={cat} category={cat} color={tagColors[cat]} />
            ))}
          </div>

          {pattern.note && (
            <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-foreground">
              {pattern.note}
            </p>
          )}

          <p className="mt-auto text-xs leading-relaxed text-muted-foreground">
            {pattern.sizeChartUrl
              ? "提示：滚轮缩放，双击放大 / 还原，放大后可拖拽查看尺码表细节。"
              : "该纸样暂未上传尺码表图片。"}
          </p>

          <button
            type="button"
            onClick={() => onDownload(pattern)}
            disabled={!pattern.fileUrl}
            title={pattern.fileUrl ? "下载电子版纸样文件" : "暂无电子版纸样文件"}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="size-4" aria-hidden="true" />
            {pattern.fileUrl ? "下载电子纸样" : "暂无电子文件"}
          </button>
        </div>
      </div>
    </div>
  )
}
