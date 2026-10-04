"use client"

import { Plus, Star, Upload, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { compressImageFile } from "@/lib/image-compress"
import { prefetchSignedParams, uploadDirectToOssFast } from "@/lib/direct-upload"
import { fileSrc, IMG_FALLBACK_DATA_URI } from "@/lib/gallery-types"
import { cn } from "@/lib/utils"

/**
 * 多图上传组件（按顺序展示，可设主图，可删除）
 * - 第一张即"主图"（也是缩略图）
 * - 鼠标 hover 非主图时显示"设为主图"按钮
 * - 删除某张后，后面的图片向前补位
 */
export function MultiImageUpload({
  label,
  values,
  onChange,
}: {
  label: string
  /** OSS key 数组，按顺序；空数组 = 空。 */
  values: string[]
  onChange: (keys: string[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const inflightRef = useRef(false)

  // 挂载时预热签名
  useEffect(() => {
    prefetchSignedParams("images")
  }, [])

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"))
    if (files.length === 0) {
      toast.error("请上传图片文件")
      return
    }
    if (inflightRef.current) {
      toast.error("正在上传中，请稍候")
      return
    }
    inflightRef.current = true
    setUploading(true)
    try {
      // 并行上传所有新文件
      const uploaded = await Promise.all(
        files.map(async (f) => {
          const compressed = await compressImageFile(f)
          return uploadDirectToOssFast(compressed.file, "images", undefined)
        }),
      )
      // 追加到末尾（不要插队——保持用户上传顺序）
      onChange([...values, ...uploaded])
      toast.success(`已上传 ${uploaded.length} 张图片`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败")
    } finally {
      setUploading(false)
      inflightRef.current = false
    }
  }

  function removeAt(idx: number) {
    const next = values.slice()
    next.splice(idx, 1)
    onChange(next)
  }

  function moveToFront(idx: number) {
    if (idx === 0) return
    const next = values.slice()
    const [item] = next.splice(idx, 1)
    if (item) next.unshift(item)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {values.length > 0 && (
          <span className="text-xs text-muted-foreground">
            共 {values.length} 张，第 1 张为主图
          </span>
        )}
      </div>

      {/* 图片网格：先展示已有图片，再追加"+"按钮 */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {values.map((key, idx) => {
          const isPrimary = idx === 0
          return (
            <div
              key={`${key}-${idx}`}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-lg border bg-muted",
                isPrimary ? "border-primary ring-1 ring-primary/40" : "border-border",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileSrc(key) || IMG_FALLBACK_DATA_URI}
                alt={`图片 ${idx + 1}`}
                className="h-full w-full object-cover"
                onError={(e) => {
                  const t = e.currentTarget
                  if (t.dataset.fallback) return
                  t.dataset.fallback = "1"
                  t.src = IMG_FALLBACK_DATA_URI
                }}
              />
              {/* 主图徽章 */}
              {isPrimary && (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
                  <Star className="size-3" />
                  主图
                </span>
              )}
              {/* 操作浮层 */}
              <div className="absolute inset-0 flex items-start justify-end gap-1 p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                {!isPrimary && (
                  <button
                    type="button"
                    onClick={() => moveToFront(idx)}
                    title="设为主图"
                    aria-label={`把图片 ${idx + 1} 设为主图`}
                    className="inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    <Star className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  title="删除"
                  aria-label={`删除图片 ${idx + 1}`}
                  className="inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-destructive shadow-sm backdrop-blur transition-colors hover:bg-destructive hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          )
        })}

        {/* 添加按钮（始终在最后） */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/50 text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-accent/40 hover:text-foreground disabled:opacity-60"
        >
          {uploading ? (
            <span className="text-[10px]">上传中…</span>
          ) : (
            <>
              {values.length === 0 ? <Upload className="size-5" /> : <Plus className="size-5" />}
              <span>{values.length === 0 ? "上传图片" : "添加"}</span>
            </>
          )}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const list = e.target.files
          if (list && list.length > 0) handleFiles(list)
          e.target.value = ""
        }}
      />

      {values.length === 0 && (
        <p className="text-xs text-muted-foreground">
          支持多张图片，至少 1 张。第一张会作为主图和列表缩略图。
        </p>
      )}
    </div>
  )
}