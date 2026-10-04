"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react"
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch"
import { CategoryBadge } from "@/components/category-badge"
import { fileSrc, imgOnError, type GalleryPattern } from "@/lib/gallery-types"
import { cn } from "@/lib/utils"

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
  // 当前显示的图片下标
  const [currentIdx, setCurrentIdx] = useState(0)

  // 切换纸样时回到第一张
  useEffect(() => {
    setCurrentIdx(0)
  }, [pattern])

  // 键盘：切换纸样时重置、ESC 关闭、左右键切图
  useEffect(() => {
    if (!pattern) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft") setCurrentIdx((i) => Math.max(0, i - 1))
      else if (e.key === "ArrowRight")
        setCurrentIdx((i) => Math.min((pattern.imageUrls?.length ?? 1) - 1, i + 1))
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [pattern, onClose])

  const goPrev = useCallback(() => {
    setCurrentIdx((i) => Math.max(0, i - 1))
  }, [])
  const goNext = useCallback(() => {
    setCurrentIdx((i) => Math.min((pattern?.imageUrls?.length ?? 1) - 1, i + 1))
  }, [pattern])

  const imageUrls = pattern?.imageUrls ?? []
  const hasMultiple = imageUrls.length > 1
  const currentSrc = imageUrls[currentIdx] ?? ""

  // react-zoom-pan-pinch 在 scale = 1 时仍然允许 pan，体验反直觉。
  // 解决：panning.disabled 直接绑定到 isZoomed（源码 2541 行：mousedown 时直接 return），
  // 同时 onTransform 跟踪 scale，scale ≤ 1 时 resetTransform 清掉残留位移。
  const [isZoomed, setIsZoomed] = useState(false)
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null)
  // 防止 resetTransform 再次触发 onTransform 导致循环
  const resettingRef = useRef(false)

  if (!pattern) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${pattern.name} 纸样详情`}
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
        {/* 图片浏览区 */}
        <div className="relative flex-1 overflow-hidden bg-muted">
          {currentSrc ? (
            <>
              {/* react-zoom-pan-pinch 提供鼠标滚轮缩放、拖拽、双击放大还原；触屏自动支持捏合手势。
                scale ≤ 1 时强制重置 transform —— 用户在 100% 时拖拽会被立刻弹回，
                避免出现"没放大却能拖"的反直觉行为。放大后可以正常拖拽查看细节。 */}
              <TransformWrapper
                ref={transformRef}
                key={currentIdx /* 切换图片时重置变换 */}
                initialScale={1}
                initialPositionX={0}
                initialPositionY={0}
                minScale={1}
                maxScale={6}
                wheel={{ step: 0.25 }}
                doubleClick={{ mode: "toggle", step: 2 }}
                pinch={{ step: 5 }}
                centerOnInit
                limitToBounds={false}
                onTransform={(_ref, state) => {
                  if (resettingRef.current) {
                    resettingRef.current = false
                    return
                  }
                  const zoomed = state.scale > 1.001
                  setIsZoomed(zoomed)
                  // scale ≤ 1 时强制把位移清零（双击缩回 / 拖到边缘的兜底）
                  if (!zoomed && (state.positionX !== 0 || state.positionY !== 0)) {
                    resettingRef.current = true
                    transformRef.current?.resetTransform?.()
                  }
                }}
                panning={{ disabled: !isZoomed }}
              >
                {({ zoomIn, zoomOut }) => (
                  <div className="relative flex h-64 w-full items-center justify-center md:h-[70vh]">
                    <TransformComponent
                      wrapperClass="!w-full !h-full"
                      contentClass="!w-full !h-full !flex !items-center !justify-center"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fileSrc(currentSrc) || "/placeholder.svg"}
                        alt={`${pattern.name} 图片 ${currentIdx + 1}`}
                        draggable={false}
                        className="max-h-full max-w-full select-none object-contain"
                        onError={imgOnError}
                      />
                    </TransformComponent>

                    {/* 缩放控制 + 重置 */}
                    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/90 p-1 shadow-sm backdrop-blur">
                      <button
                        type="button"
                        onClick={() => zoomOut()}
                        className="inline-flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
                        aria-label="缩小"
                      >
                        <ZoomOutIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => transformRef.current?.resetTransform?.()}
                        className="px-2 text-xs tabular-nums text-muted-foreground hover:text-foreground"
                        aria-label="重置视图"
                      >
                        重置
                      </button>
                      <button
                        type="button"
                        onClick={() => zoomIn()}
                        className="inline-flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
                        aria-label="放大"
                      >
                        <ZoomInIcon />
                      </button>
                    </div>
                  </div>
                )}
              </TransformWrapper>

              {/* 左右切图（多图时显示） */}
              {hasMultiple && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={currentIdx === 0}
                    aria-label="上一张"
                    className="absolute left-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-sm backdrop-blur transition-opacity hover:bg-accent disabled:opacity-30"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={currentIdx >= imageUrls.length - 1}
                    aria-label="下一张"
                    className="absolute right-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-sm backdrop-blur transition-opacity hover:bg-accent disabled:opacity-30"
                  >
                    <ChevronRight className="size-5" />
                  </button>

                  {/* 计数 */}
                  <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-border bg-card/90 px-2.5 py-0.5 text-xs tabular-nums text-muted-foreground shadow-sm backdrop-blur">
                    {currentIdx + 1} / {imageUrls.length}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex h-64 w-full items-center justify-center p-6 text-center md:h-[70vh]">
              <p className="text-sm text-muted-foreground">该纸样暂无图片</p>
            </div>
          )}

          {/* 缩略图条（多图时显示） */}
          {hasMultiple && (
            <div className="absolute bottom-16 left-1/2 hidden -translate-x-1/2 gap-1.5 rounded-lg border border-border bg-card/90 p-1.5 shadow-sm backdrop-blur sm:flex">
              {imageUrls.map((url, i) => (
                <button
                  key={url + i}
                  type="button"
                  onClick={() => setCurrentIdx(i)}
                  aria-label={`切换到第 ${i + 1} 张`}
                  className={cn(
                    "size-10 overflow-hidden rounded-md border-2 transition-all",
                    i === currentIdx
                      ? "border-primary"
                      : "border-transparent opacity-70 hover:opacity-100",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fileSrc(url) || "/placeholder.svg"}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
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

          {/* 缩略图列表（始终显示，方便快速跳图） */}
          {imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {imageUrls.map((url, i) => (
                <button
                  key={url + i}
                  type="button"
                  onClick={() => setCurrentIdx(i)}
                  aria-label={`查看第 ${i + 1} 张图`}
                  className={cn(
                    "size-12 overflow-hidden rounded-md border-2 transition-all",
                    i === currentIdx
                      ? "border-primary"
                      : "border-border opacity-70 hover:opacity-100",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fileSrc(url) || "/placeholder.svg"}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={imgOnError}
                  />
                </button>
              ))}
            </div>
          )}

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
            提示：滚轮或双指缩放查看图片细节，多张图片可点击下方缩略图或左右切换。
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

/* ---- 内联 SVG 图标，避免引入 lucide 的 Plus/Minus/RotateCcw 占据多行 --- */
function ZoomOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  )
}
function ZoomInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  )
}