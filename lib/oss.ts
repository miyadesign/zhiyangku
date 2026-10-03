import "server-only"
import { Agent as HttpAgent } from "http"
import { Agent as HttpsAgent } from "https"
import OSS from "ali-oss"
import crypto from "crypto"

/**
 * 阿里云 OSS 私有 Bucket 客户端
 *
 * 设计目标：
 * 1. 服务端单例：每次新构建 SDK 客户端浪费资源，模块级缓存即可
 * 2. 私有 Bucket 永远不要把 secure_url 直接发给前端（会 403）
 * 3. 读取/下载一律走签名 URL，时效由 ALI_OSS_SIGN_EXPIRES 控制（默认 1 小时）
 * 4. 上传由服务端代理完成：客户端只发文件字节给 /api/upload，服务端 put 到 patterns/ 目录
 * 5. 数据库只存 key（如 patterns/images/xxx.png），不带域名/协议头，方便未来切 CDN/迁移
 *
 * OSS 连接管理（关键性能）：
 * - SDK 默认用 agentkeepalive 但 keepAlive=false，意味着空闲连接会被服务器关
 * - 跨洲（CN → 新加坡）每次新建连接付 ~2s SSL 握手 + TCP 慢启动
 * - 我们自定义 https agent，强制 keepAlive=true，30s 空闲保留 socket，10 个 maxFreeSockets
 * - 首次上传后连接进入 free pool；30s 内复用 socket = 0 握手成本
 * - 超 30s 才重新付握手（OSS 默认 idle timeout），但用户体验上：用户连传几张图都连
 */

const region = process.env.ALI_OSS_REGION || "oss-ap-southeast-1"
const bucket = process.env.ALI_OSS_BUCKET || "zhiyangku"
const accessKeyId = process.env.ALI_OSS_ACCESS_KEY_ID || ""
const accessKeySecret = process.env.ALI_OSS_ACCESS_KEY_SECRET || ""

// 签名 URL 默认有效期（秒）。前端列表/详情只读图片，1 小时足够；超过会自动重新签名
export const SIGN_EXPIRES_SEC = Number(process.env.ALI_OSS_SIGN_EXPIRES || 3600)

// 自定义 https agent：长 keep-alive + 复用空闲 socket
//  - keepAlive=true：让 OS 层 TCP keep-alive 保持连接活跃
//  - keepAliveMsecs=30000：30s 空闲仍然保持（OSS server 端 idle timeout 一般 30-60s）
//  - maxSockets=20：并发上限（批量上传时能并行 20 个 PUT）
//  - maxFreeSockets=10：free pool 保留 10 个空闲 socket 备用
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const keepAliveAgentOpts: any = {
    keepAlive: true,
    keepAliveMsecs: 30_000,
    maxSockets: 20,
    maxFreeSockets: 10,
    freeSocketTimeout: 30_000,
}
const keepAliveHttpAgent = new HttpAgent(keepAliveAgentOpts)
const keepAliveHttpsAgent = new HttpsAgent(keepAliveAgentOpts)

/** 单例 OSS 客户端（v1 签名 + region 默认 endpoint + 长 keep-alive） */
export const oss = new OSS({
    region,
    bucket,
    accessKeyId,
    accessKeySecret,
    secure: true,
    // 允许更长的连接超时（跨洲场景下 SSL 握手可能较慢）
    timeout: 60 * 1000,
    // ali-oss 的类型签名里 Options 没 agent/httpsAgent 字段，但运行时支持
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ agent: keepAliveHttpAgent, httpsAgent: keepAliveHttpsAgent } as any),
})

/**
 * 预热 OSS 连接池：进程启动时主动发一次 HEAD 到 OSS，让 SSL 握手 + TCP 慢启动完成。
 * 调用此函数后，第一次上传不用付握手成本。
 * 调用时机：Next.js dev server 启动后 100ms（避开冷启动噪声）
 */
export async function warmupOss(): Promise<void> {
    try {
        const t0 = Date.now()
        // HEAD bucket 是一个极轻请求（<1KB 响应），专门付握手成本
        await oss.getBucketACL(bucket)
        const ms = Date.now() - t0
        console.log(`[oss] warmup 完成 in ${ms}ms, 连接池已热`)
    } catch (e) {
        console.warn("[oss] warmup 失败:", e instanceof Error ? e.message : e)
    }
}

/* --------------------------------------------------------------- CORS 自愈
 * 直接派给 /api/sign-upload PUT 到 OSS 走跨域需要 OSS Bucket 配 CORS。
 * 没配时直传会被浏览器拦下 → 退到 /api/upload 中转（慢 5-10s）。
 * 我们在签名路由首次被调用时自动检查并写入 CORS；成功后内存标记，
 * 避免每次请求都查 OSS。失败也不阻塞主流程（兜底走中转）。
 */

type CorsRule = {
    allowedOrigin: string | string[]
    allowedMethod: string | string[]
    allowedHeader?: string | string[]
    exposeHeader?: string | string[]
    maxAgeSeconds?: string | number
}

const DEFAULT_CORS = [
    {
        allowedOrigin: "*",
        allowedMethod: ["PUT", "POST", "GET", "HEAD", "DELETE"],
        allowedHeader: "*",
        exposeHeader: ["ETag", "x-oss-request-id"],
        maxAgeSeconds: "3600",
    },
]

let corsEnsured: Promise<boolean> | null = null

/** 检查并（按需）写入 CORS 规则。返回是否已就绪。模块级缓存，进程内只查一次。 */
export async function ensureCors(): Promise<boolean> {
    if (corsEnsured) return corsEnsured
    corsEnsured = (async () => {
        try {
            const got = await oss.getBucketCORS(bucket)
            const rules = (got?.rules || []) as CorsRule[]
            const hasAllowed = (r: CorsRule, v: string) =>
                Array.isArray(r.allowedOrigin) ? r.allowedOrigin.includes(v) : r.allowedOrigin === v
            const hasMethod = (r: CorsRule, m: string) =>
                Array.isArray(r.allowedMethod) ? r.allowedMethod.includes(m) : r.allowedMethod === m
            const ok = rules.some((r) => hasAllowed(r, "*") && hasMethod(r, "PUT"))
            if (ok) return true
            await oss.putBucketCORS(bucket, DEFAULT_CORS)
            return true
        } catch (e) {
            console.warn(
                "[oss] ensureCors failed, 直传可能仍走 CORS fallback:",
                e instanceof Error ? e.message : e,
            )
            return false
        }
    })()
    return corsEnsured
}

/**
 * 上传文件到 OSS patterns/ 目录。
 * 返回 OSS key（如 patterns/images/xxx.png），不含域名/协议头。
 */
export async function uploadToOss(
    buffer: Buffer,
    filename: string,
    folder: "images" | "files" = "images",
): Promise<string> {
    const baseName = filename.replace(/[/\\:*?"<>|]/g, "_")
    const ext = baseName.match(/\.[^.]+$/)?.[0] || (folder === "images" ? ".png" : "")
    const stamp = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 8)
    const key = `patterns/${folder}/${stamp}_${rand}${ext}`
    await oss.put(key, buffer)
    return key
}

/** 生成临时签名 URL（GET）。前端用这个直接显示/下载文件 */
export function signUrl(key: string, expiresSec: number = SIGN_EXPIRES_SEC): string {
    if (!key) return ""
    return oss.signatureUrl(key, { expires: expiresSec })
}

/** 手动构造阿里云 OSS v1 签名 PUT URL，Content-Type 行留空（让浏览器传任意类型都能匹配）
 *
 * v1 StringToSign = HTTP_METHOD + "\n" + Content-MD5 + "\n" + Content-Type + "\n" + Expiration + "\n" + CanonicalizedResource
 *
 * 关键设计：Content-Type 行留空，浏览器发什么 Content-Type 都能匹配。
 *
 * OSS v1 签名规则（PUT）：
 * - Content-Type 为空时，StringToSign 中该行留空（即只有换行符）
 * - 资源路径格式：/bucket-name/object-key（不含域名和协议）
 */
export function signPutUrl(key: string, expiresSec = 300): string {
    if (!key) return ""

    const objectKey = key // 已是 "patterns/images/xxx.jpg" 格式
    const expiration = Math.floor(Date.now() / 1000) + expiresSec

    // v1 签名：Content-Type 为空时留空行
    const stringToSign = [
        "PUT",
        "",      // Content-MD5（可空）
        "",      // Content-Type（留空 = 任意 Content-Type 都能通过验证）
        expiration.toString(),
        `/${bucket}/${objectKey}`,
    ].join("\n")

    const signature = crypto
        .createHmac("sha1", accessKeySecret)
        .update(stringToSign)
        .digest("base64")

    const url = new URL(`https://${bucket}.oss-${region}.aliyuncs.com/${objectKey}`)
    url.searchParams.set("OSSAccessKeyId", accessKeyId)
    url.searchParams.set("Expires", expiration.toString())
    url.searchParams.set("Signature", signature)

    return url.toString()
}

/** 删除 OSS 资源（出错不抛出，由调用方决定如何处理） */
export async function deleteFromOss(key: string): Promise<void> {
    if (!key) return
    try {
        await oss.delete(key)
    } catch (e) {
        console.error("[oss] delete error:", e)
    }
}

/**
 * 从 Cloudinary 完整 URL 中提取出 OSS 友好的 key（用于一次性数据迁移）。
 * 例：https://res.cloudinary.com/ycr26aiu/image/upload/v1790776160/patterns/images/xxx.png
 *   -> patterns/images/xxx.png
 */
export function cloudinaryUrlToOssKey(url: string): string | null {
    if (!url) return null
    const m = url.match(/\/patterns\/(images|files)\/(.+?)(?:\?|$)/)
    if (!m) return null
    try {
        return `patterns/${m[1]}/${decodeURIComponent(m[2])}`
    } catch {
        return `patterns/${m[1]}/${m[2]}`
    }
}
