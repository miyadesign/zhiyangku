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
    /** 网盘分享链接（可选） */
    cloudDriveUrl: string | null
    note: string | null
}

/** pathname -> 前台可访问的 URL
 * - 完整 URL (http/https) 直接使用（OSS 签名 URL）
 * - 相对路径（理论上不该出现）兜底走 /api/file?key= 代理
 */
export function fileSrc(pathname: string): string {
    if (!pathname) return ""
    if (pathname.startsWith("/")) return pathname
    if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
        return pathname
    }
    return `/api/file?key=${encodeURIComponent(pathname)}`
}

/** 列表卡片使用同源缩略图路由，Cloudflare Workers 会按需生成小图。 */
export function thumbnailSrc(pathname: string): string {
    if (!pathname) return ""

    let src = pathname
    if (/^https?:\/\//i.test(src)) {
        try {
            const url = new URL(src)
            if (!url.hostname.endsWith(".aliyuncs.com")) return src
            src = decodeURIComponent(url.pathname.replace(/^\//, ""))
        } catch {
            return src
        }
    }

    if (src.startsWith("/api/file?")) {
        const url = new URL(src, "http://localhost")
        url.searchParams.set("preview", "1")
        return `${url.pathname}${url.search}`
    }

    if (src.startsWith("patterns/images/")) {
        return `/api/file?key=${encodeURIComponent(src)}&preview=1`
    }

    return fileSrc(src)
}

/** 电子版纸样文件下载 URL（带 Content-Disposition 附件名） */
export function downloadSrc(pathname: string, filename?: string | null): string {
    if (pathname.startsWith("/")) {
        const url = new URL(pathname, "http://localhost")
        url.searchParams.set("download", "1")
        if (filename) url.searchParams.set("filename", filename)
        return `${url.pathname}${url.search}`
    }
    if (pathname && (pathname.startsWith("http://") || pathname.startsWith("https://"))) {
        return pathname
    }
    const base = `/api/file?key=${encodeURIComponent(pathname)}&download=1`
    return filename ? `${base}&filename=${encodeURIComponent(filename)}` : base
}

/** 图片请求可能短暂失败，先自动重试两次，仍失败才显示兜底图。 */
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
  if (el.dataset.fallback) return
  const currentSrc = el.getAttribute("src") || ""
  const originalSrc = el.dataset.originalSrc || currentSrc
  const retryCount = Number(el.dataset.retryCount || 0)

  if (retryCount < 2 && originalSrc) {
    const nextRetry = retryCount + 1
    el.dataset.originalSrc = originalSrc
    el.dataset.retryCount = String(nextRetry)
    el.dataset.retryAttemptSrc = currentSrc
    window.setTimeout(() => {
      if (!el.isConnected || el.dataset.retryAttemptSrc !== currentSrc || el.getAttribute("src") !== currentSrc) return
      try {
        const retryUrl = new URL(originalSrc, window.location.href)
        if (retryUrl.origin === window.location.origin) {
          retryUrl.searchParams.set("_image_retry", `${nextRetry}-${Date.now()}`)
          el.src = `${retryUrl.pathname}${retryUrl.search}${retryUrl.hash}`
        } else {
          // 外站签名 URL 不能附加查询参数，否则会破坏签名；原地址延迟重试。
          el.src = originalSrc
        }
      } catch {
        el.src = originalSrc
      }
    }, 350 * nextRetry)
    return
  }

  el.dataset.fallback = "1"
  console.warn("[image-fallback] retries exhausted:", originalSrc)
  el.src = IMG_FALLBACK_DATA_URI
}

export function imgOnLoad(e: React.SyntheticEvent<HTMLImageElement>): void {
  const el = e.currentTarget
  delete el.dataset.retryCount
  delete el.dataset.originalSrc
  delete el.dataset.retryAttemptSrc
  delete el.dataset.fallback
}
