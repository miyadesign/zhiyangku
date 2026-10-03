/** @type {import('next').NextConfig} */
const nextConfig = {
    typescript: {
        ignoreBuildErrors: true,
    },
    turbopack: {},
    images: {
        unoptimized: true,
    },
    devIndicators: false,
    serverExternalPackages: ["ali-oss", "@neondatabase/serverless"],
    // 上传路由允许更大 body（Vercel 默认 4.5MB，直接调 API 的 upload 需要更多空间）
    api: {
        bodyParser: {
            sizeLimit: "10mb",
        },
    },
}

export default nextConfig