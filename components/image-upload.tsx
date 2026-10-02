"use client"

import { FileText, Upload, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { prefetchSignedParams, uploadDirectToOssFast } from "@/lib/direct-upload"
import { compressImageFile } from "@/lib/image-compress"
import { cn } from "@/lib/utils"

function fileProxy(pathname: string) {
    // 已是完整 URL（OSS 签名 URL 或迁移期残留的 Cloudinary URL）直接使用
    if (pathname.startsWith("http")) return pathname
    // 兜底走 /api/file 代理（理论上不会触发）
    return `/api/file?key=${encodeURIComponent(pathname)}`
}

export function ImageUpload({
  label,
  value,
  onChange,
  inputId,
  variant = "image",
  fileName,
  hint,
}: {
  label: string
  /** Blob pathname，空表示未上传 */
  value: string | null
  /** 图片模式仅回传 pathname；文件模式同时回传原始文件名 */
  onChange: (pathname: string | null, fileName?: string | null) => void
  inputId?: string
  /** image：图片（可预览）；file：电子版纸样文件（任意类型） */
  variant?: "image" | "file"
  /** 文件模式下已上传文件的原始名 */
  fileName?: string | null
  hint?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  // 上传中拒绝再次选择文件，防重叠导致 uploadCache key 错配
  const inflightRef = useRef(false)

  const isImage = variant === "image"

  // 组件挂载时立刻预热签名：消除第一张上传的 ~150ms 延迟
  useEffect(() => {
    const folder: "images" | "files" = isImage ? "images" : "files"
    prefetchSignedParams(folder)
  }, [isImage])

  async function handleFile(file: File) {
    if (isImage && !file.type.startsWith("image/")) {
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
      const folder: "images" | "files" = isImage ? "images" : "files"
      const t0 = performance.now()
      const url = await uploadDirectToOssFast(
        file,
        folder,
        isImage ? async (f) => (await compressImageFile(f)).file : undefined,
      )
      const ms = Math.round(performance.now() - t0)
      console.log(`[upload] ${file.name} (${(file.size / 1024).toFixed(1)}KB) 总耗时 ${ms}ms`)
      onChange(url, file.name)
      toast.success("上传成功")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败")
    } finally {
      setUploading(false)
      inflightRef.current = false
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const dropZoneClass = cn(
    "flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm transition-colors disabled:opacity-60",
    dragOver
      ? "border-primary bg-accent/60 text-foreground"
      : "border-border bg-muted/50 text-muted-foreground hover:border-primary hover:bg-accent/40",
  )

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>

      {/* 已有值 —— 图片预览 或 文件卡片 */}
      {value && isImage ? (
        <div
          className="relative w-full overflow-hidden rounded-lg border border-border bg-muted"
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileProxy(value) || "/placeholder.svg"}
            alt={label}
            className="max-h-56 w-full object-contain"
            onError={(e) => {
              const t = e.currentTarget
              if (t.dataset.fallback) return
              t.dataset.fallback = "1"
              t.src = "/placeholder.svg"
            }}
          />
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground/70 text-background hover:bg-foreground"
            aria-label="移除"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : value && !isImage ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/60 p-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/20 text-primary-foreground">
            <FileText className="h-5 w-5 text-foreground" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {fileName || "已上传文件"}
          </span>
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground/70 text-background hover:bg-foreground"
            aria-label="移除文件"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={dropZoneClass}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {isImage ? <Upload className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          {uploading
            ? "上传中…"
            : dragOver
              ? "松开鼠标上传"
              : isImage
                ? "点击或拖拽图片到此上传"
                : "点击或拖拽文件到此上传"}
          {hint && <span className="px-4 text-center text-xs opacity-70">{hint}</span>}
        </button>
      )}

      {value && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="self-start"
        >
          {uploading ? "上传中…" : isImage ? "更换图片" : "更换文件"}
        </Button>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={isImage ? "image/*" : undefined}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ""
        }}
      />
    </div>
  )
}
