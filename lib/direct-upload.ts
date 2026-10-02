"use client"
import { compressImageFile } from "@/lib/image-compress"

/**
 * 客户端上传文件到阿里云 OSS。
 *
 * 关键路径选择：
 * - OSS 在新加坡，中国大陆浏览器到 OSS 单次 SSL 握手 ~2s（跨洲跨境）。
 *   哪怕 130KB 文件，直传 1 次也要付 2s 握手 + 传输 = 3-5s。
 * - 中转路径（浏览器 → Next.js → OSS）：浏览器这一跳只走 Next.js（同机房
 *   或同服务商就 ~50ms），服务端 put 到 OSS 时也只付 1 次握手 = 同等时长。
 *
 * 因此默认走中转：
 *  - 少了 CORS 预检 + 跨域签名校验（直传要先 OPTIONS 探测 CORS）
 *  - 浏览器到 Next.js 这一段若同区域，几乎 0 握手（HTTP/2 keep-alive 复用）
 *  - 失败只付一次重试，不会有直传 405/403 这种"已花了几秒才知道失败"
 *
 * 直传仍保留为可选路径（uploadDirectToOssViaDirectPut），未来跨区部署时再用。
 */

export interface UploadResult {
    key: string
}

const uploadCache = new Map<string, Promise<string>>()

/** 生成 OSS key：与 lib/oss.ts 中规则一致，前置到这里让客户端尽早拿到 key */
function buildKey(filename: string, folder: "images" | "files"): string {
    const baseName = filename.replace(/[/\\:*?"<>|]/g, "_")
    const ext = baseName.match(/\.[^.]+$/)?.[0] || (folder === "images" ? ".png" : "")
    const stamp = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 8)
    return `patterns/${folder}/${stamp}_${rand}${ext}`
}

interface SignedUpload {
    uploadUrl: string
    key: string
    expiresAt: number
}

/** 向 /api/sign-upload 请求一个 PUT 签名 URL（直传路径用） */
async function getSignedUpload(filename: string, folder: "images" | "files"): Promise<SignedUpload> {
    const url = `/api/sign-upload?folder=${encodeURIComponent(folder)}&filename=${encodeURIComponent(filename)}`
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `签名失败 (${r.status})`)
    }
    return (await r.json()) as SignedUpload
}

/**
 * 中转上传：默认路径。浏览器 → Next.js /api/upload → 服务端 putStream 到 OSS。
 *
 * 为什么默认走中转：
 * - 中转只需 1 次到 Next.js 的 HTTPS + 1 次服务端到 OSS 的 HTTPS
 * - 没有 CORS 预检（浏览器 → Next.js 同源）
 * - 没有签名 URL 校验失败的复杂错误（CORS 没配 / v4/v1 不匹配）
 * - 服务端到 OSS 内网连通比浏览器到 OSS 公网快很多
 *
 * 性能日志：上传完后打总耗时 + 服务端报告的耗时（如果服务端 X-Server-Time header 回传），
 * 便于在浏览器里就能看出瓶颈在哪一段。
 */
async function uploadViaProxy(
    fileToUpload: File,
    filename: string,
    folder: "images" | "files",
): Promise<string> {
    const key = buildKey(filename, folder)
    const t0 = performance.now()
    const r = await fetch("/api/upload", {
        method: "POST",
        // 不显式设置 Content-Length，浏览器自动加（由 file.size 决定）。
        // 不用 multipart/form-data，省一次 boundary 编码 + 解析。
        headers: {
            "content-type": "application/octet-stream",
            "x-filename": encodeURIComponent(filename),
            "x-folder": folder,
            "x-oss-key": key,
        },
        body: fileToUpload,
        // 中转路径让客户端等久些没关系；但仍要有限度，免得挂死
        signal: AbortSignal.timeout(60_000),
        // keepalive 让同一会话的多次上传复用连接
        keepalive: true,
    })
    if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `上传失败 (${r.status})`)
    }
    if (typeof window !== "undefined") {
        // 只在浏览器里打日志，SSR 不会有 performance
        const ms = Math.round(performance.now() - t0)
        // 服务端 put 耗时（通过 Server-Timing header 回传，如果服务端配了的话）
        const serverTiming = r.headers.get("server-timing") || ""
        const kb = (fileToUpload.size / 1024).toFixed(1)
        console.log(
            `[upload] 中转 ${kb}KB ${filename} → ${ms}ms ${serverTiming ? "(" + serverTiming + ")" : ""}`,
        )
    }
    const data = (await r.json()) as UploadResult
    return data.key
}

/**
 * 直传路径（保留作高级选项/未来跨区加速用）。
 * 浏览器拿签名 URL 后直接 PUT 到 OSS，跳开 Next.js 中转。
 * 当前默认不调用，仅在显式传 useDirectPut=true 时启用。
 */
async function tryDirectPut(
    fileToUpload: File,
    filename: string,
    folder: "images" | "files",
): Promise<string> {
    const signed = await getSignedUpload(filename, folder)
    const put = await fetch(signed.uploadUrl, {
        method: "PUT",
        body: fileToUpload,
        signal: AbortSignal.timeout(30_000),
    })
    if (put.ok) return signed.key
    throw new Error(`直传失败 (${put.status})`)
}

/** 上传单文件到 OSS，返回存储 key（patterns/images/xxx.png）。默认走中转。 */
export async function uploadToOssDirect(
    file: File,
    folder: "images" | "files",
    compress?: (f: File) => Promise<File>,
    useDirectPut = false,
): Promise<string> {
    const cacheKey = `${folder}:${file.name}:${file.size}:${file.lastModified}`
    const cached = uploadCache.get(cacheKey)
    if (cached) return cached

    const fileToUpload = compress ? await compress(file) : file

    const p = (async () => {
        if (useDirectPut) {
            try {
                return await tryDirectPut(fileToUpload, file.name, folder)
            } catch (e) {
                console.warn(
                    "[upload] 直传失败，退回中转:",
                    e instanceof Error ? e.message : e,
                )
            }
        }
        // 默认走中转
        return uploadViaProxy(fileToUpload, file.name, folder)
    })()

    uploadCache.set(cacheKey, p)
    return p
}

/**
 * Pipeline 版上传：服务端把 key 转成签名 URL。
 *  - 立即开始压缩（CPU bound，100-500ms）
 *  - 压缩完成立刻 PUT 到 OSS（直传）或 POST 到 /api/upload（中转）
 * 总耗时 ≈ 压缩 + 网络上传，比纯串行快。
 */
export async function uploadDirectToOssFast(
    file: File,
    folder: "images" | "files",
    compress?: (f: File) => Promise<File>,
): Promise<string> {
    const realCompress = compress ?? (folder === "images" ? async (f) => (await compressImageFile(f)).file : undefined)
    return uploadToOssDirect(file, folder, realCompress, false)
}

/** @deprecated 请改用 uploadDirectToOssFast，保留这个名字仅为兼容旧调用站点 */
export const uploadDirectToCloudinaryFast = uploadDirectToOssFast

/** 预热：组件挂载时主动预热签名，让第一张上传 0 等待（保留接口） */
const prefetchPromises = new Map<string, Promise<SignedUpload>>()
export async function prefetchSignedParams(folder: "images" | "files"): Promise<void> {
    // 当前默认不走直传，但保留接口让 UI 不报错；预热改成 ping /api/sign-upload 让首张直传也能 0 等待
    if (prefetchPromises.has(folder)) return
    const p = getSignedUpload("warmup.bin", folder).catch(() => null)
    prefetchPromises.set(folder, p as Promise<SignedUpload>)
}