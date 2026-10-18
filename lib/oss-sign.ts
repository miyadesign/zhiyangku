import "server-only"
import crypto from "crypto"

const rawRegion = process.env.ALI_OSS_REGION || "ap-southeast-1"
export const OSS_REGION = rawRegion.replace(/^oss-/, "")
export const OSS_BUCKET = process.env.ALI_OSS_BUCKET || "zhiyangku"

/** Generate an OSS v1 presigned PUT URL without loading the Node OSS SDK. */
export function signPutUrl(key: string, expiresSec = 300, contentType = ""): string {
    if (!key) return ""

    const accessKeyId = process.env.ALI_OSS_ACCESS_KEY_ID || ""
    const accessKeySecret = process.env.ALI_OSS_ACCESS_KEY_SECRET || ""
    if (!accessKeyId || !accessKeySecret) {
        throw new Error("OSS 运行时缺少 ALI_OSS_ACCESS_KEY_ID 或 ALI_OSS_ACCESS_KEY_SECRET")
    }

    const expiration = Math.floor(Date.now() / 1000) + expiresSec
    const stringToSign = ["PUT", "", contentType, expiration.toString(), `/${OSS_BUCKET}/${key}`].join("\n")
    const signature = crypto.createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64")
    const url = new URL(`https://${OSS_BUCKET}.oss-${OSS_REGION}.aliyuncs.com/${key}`)
    url.searchParams.set("OSSAccessKeyId", accessKeyId)
    url.searchParams.set("Expires", expiration.toString())
    url.searchParams.set("Signature", signature)
    return url.toString()
}
