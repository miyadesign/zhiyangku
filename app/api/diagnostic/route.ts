import { type NextRequest, NextResponse } from "next/server"
import { oss } from "@/lib/oss"

/**
 * 诊断 OSS 连接状态。
 * 用于排查 403/500 等上传错误。
 */
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
    const checks: Record<string, { ok: boolean; detail: string }> = {}
    
    // 1. 检查环境变量
    checks.env = {
        ok: Boolean(process.env.ALI_OSS_ACCESS_KEY_ID && process.env.ALI_OSS_ACCESS_KEY_SECRET),
        detail: `AK_ID=${process.env.ALI_OSS_ACCESS_KEY_ID ? "✓" : "✗"} AK_SECRET=${process.env.ALI_OSS_ACCESS_KEY_SECRET ? "✓" : "✗"} BUCKET=${process.env.ALI_OSS_BUCKET} REGION=${process.env.ALI_OSS_REGION}`,
    }
    
    // 2. 测试 bucket 访问
    try {
        const acl = await oss.getBucketACL(process.env.ALI_OSS_BUCKET || "zhiyangku")
        checks.bucketAccess = {
            ok: true,
            detail: `ACL=${acl.acl} (200 OK)`,
        }
    } catch (e) {
        checks.bucketAccess = {
            ok: false,
            detail: e instanceof Error ? e.message : String(e),
        }
    }
    
    // 3. 测试签名 URL 生成
    try {
        const testKey = "diagnostic/test.txt"
        const url = oss.signatureUrl(testKey, { expires: 60 })
        checks.signature = {
            ok: Boolean(url && url.includes("Signature")),
            detail: `URL=${url.split("?")[0]}... (${url.includes("OSSAccessKeyId") ? "v1" : "v4"})`,
        }
    } catch (e) {
        checks.signature = {
            ok: false,
            detail: e instanceof Error ? e.message : String(e),
        }
    }
    
    // 4. 测试 PUT 签名
    try {
        const putKey = "diagnostic/test.txt"
        // @ts-ignore ali-oss types incomplete
        const url = oss.signatureUrl(putKey, { expires: 60, method: "PUT" })
        checks.putSignature = {
            ok: Boolean(url && url.includes("Signature")),
            detail: `URL=${url.split("?")[0]}...`,
        }
    } catch (e) {
        checks.putSignature = {
            ok: false,
            detail: e instanceof Error ? e.message : String(e),
        }
    }
    
    const allOk = Object.values(checks).every((c) => c.ok)
    
    return NextResponse.json({
        ok: allOk,
        timestamp: new Date().toISOString(),
        region: process.env.VERCEL_REGION || "unknown",
        checks,
    }, { status: allOk ? 200 : 500 })
}
