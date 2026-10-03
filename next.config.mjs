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
}

export default nextConfig