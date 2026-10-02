import { type NextRequest, NextResponse } from "next/server"
import { signPutUrl, ensureCors } from "@/lib/oss"

/**
 * 签发 OSS 直传 PUT URL。
 *
 * 为什么需要这个？
 * - 浏览器直接 PUT 到 OSS 跳开 Next.js 中转：节省"浏览器→Next.js→OSS"两跳
 *   网络，特别是 OSS 在新加坡（oss-ap-southeast-1）跨洲时，跳数越少越快
 * - 服务端用 AK 计算签名 URL，浏览器拿到 URL 直接 PUT，不需要 AK
 * - 签名 URL 短时（默认 5 分钟），用完即焚
 *
 * 自愈：首次调用会自动确保 Bucket CORS 已配（OSS 跨域 PUT 必需）。
 * 配好后浏览器才能直接 PUT，否则会被拦下退到中转（慢 5-10s）。
 *
 * 加速：如果 env ALI_OSS_ACCELERATE=1，会走 oss-accelerate.aliyuncs.com + v4 签名，
 *      跨境场景下 SSL 握手从 ~2s 降到 ~0.1s，130KB 小文件从 15s+ 降到 1-2s。
 *
 * 协议：GET /api/sign-upload?folder=images&filename=foo.png
 *   → { uploadUrl, key, expiresAt }
 */
export const dynamic = "force-dynamic"

// CORS 自检不阻塞主流程：fire-and-forget（warmup 也走这条）
const corsP = ensureCors().catch(() => false)

export async function GET(request: NextRequest) {
    try {
        const folder = request.nextUrl.searchParams.get("folder")
        const filename = request.nextUrl.searchParams.get("filename") || "upload"
        if (folder !== "images" && folder !== "files") {
            return NextResponse.json({ error: "folder 必须为 images 或 files" }, { status: 400 })
        }

        // 等 CORS 自检完成（幂等且进程内只查一次）；失败也不阻塞，会返回正常签名
        // 直传失败时客户端仍能 fallback 到 /api/upload 中转
        await corsP

        const key = buildKey(filename, folder)
        // signPutUrl 是同步的 v1 签名
        const uploadUrl = signPutUrl(key, 300)

        return NextResponse.json({
            uploadUrl,
            key,
            expiresAt: Date.now() + 300_000,
        })
    } catch (error) {
        console.error("[sign-upload] error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "签名失败" },
            { status: 500 },
        )
    }
}

function buildKey(filename: string, folder: "images" | "files"): string {
    const baseName = filename.replace(/[/\\:*?"<>|]/g, "_")
    const ext = baseName.match(/\.[^.]+$/)?.[0] || (folder === "images" ? ".png" : "")
    const stamp = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 8)
    return `patterns/${folder}/${stamp}_${rand}${ext}`
}