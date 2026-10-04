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
    // Vercel 函数 body 限制在 vercel.json 里配，这里不需要 api.bodyParser
}

export default nextConfig