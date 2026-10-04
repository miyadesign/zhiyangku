export type GalleryPattern = {
    id: number
    name: string
    studio: string
    categories: string[]
    /** 所有图片签名 URL 数组（已在服务端缓存层生成），第一张是主图 / 缩略图 */
    imageUrls: string[]
    /** 主图 URL，等价于 imageUrls[0] ?? ""。保留以兼容卡片等只用单图的场景 */
    thumbnailUrl: string
    /** OSS 签名 URL（电子版纸样文件，可空） */
    fileUrl: string | null
    /** 电子版纸样文件的原始文件名（下载时使用） */
    fileName: string | null
    note: string | null
}

/** pathname -> 前台可访问的 URL
 * - 完整 URL (http/https) 直接使用（OSS 签名 URL）
 * - 相对路径（理论上不该出现）兜底走 /api/file?key= 代理
 */
export function fileSrc(pathname: string): string {
    if (!pathname) return ""
    if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
        return pathname
    }
    return `/api/file?key=${encodeURIComponent(pathname)}`
}

/** 电子版纸样文件下载 URL（带 Content-Disposition 附件名） */
export function downloadSrc(pathname: string, filename?: string | null): string {
    if (pathname && (pathname.startsWith("http://") || pathname.startsWith("https://"))) {
        return pathname
    }
    const base = `/api/file?key=${encodeURIComponent(pathname)}&download=1`
    return filename ? `${base}&filename=${encodeURIComponent(filename)}` : base
}

/**
 * 图片加载失败的兜底 onError：替换 src 为占位图（data URI，无额外请求）。
 * 用法：<img src={fileSrc(...)} onError={imgOnError} />
 *
 * 一次性替换：把 src 改成 data URI 后浏览器不会再触发 error。
 */
export const IMG_FALLBACK_DATA_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f1f5f9"/>
  <text x="200" y="155" font-family="system-ui" font-size="14" fill="#64748b" text-anchor="middle">图片已失效</text>
</svg>`,
  )

export function imgOnError(e: React.SyntheticEvent<HTMLImageElement>): void {
  const el = e.currentTarget
  // 防止无限触发
  if (el.dataset.fallback) return
  el.dataset.fallback = "1"
  // console 打印，方便排查具体哪个 public_id 失效
  const originalSrc = el.getAttribute("src") || ""
  console.warn("[image-fallback] 图片已失效:", originalSrc)
  el.src = IMG_FALLBACK_DATA_URI
}
