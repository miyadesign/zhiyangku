/** @type {import('next').NextConfig} */
const nextConfig = {
    typescript: {
        ignoreBuildErrors: true,
    },
    images: {
        unoptimized: true,
    },
    devIndicators: false,
    // ali-oss 依赖 urllib，urllib 内含一个静态 require('proxy-agent')，
    // webpack 静态分析会扫到这条路径并要求模块存在。
    // 用 serverExternalPackages 把整个 ali-oss 排除 webpack 打包，运行时由 Node 原生 require 解析。
    // @neondatabase/serverless 依赖 ws 和 node:net 等内置模块，也必须排除。
    serverExternalPackages: ["ali-oss", "@neondatabase/serverless"],
    // instrumentation.ts 用到了 net/tls/dns 等 Node 内置模块。
    // webpack 即使在 client 也会扫描 instrumentation.ts 做依赖图分析。
    // 加上 fallback 让 webpack 接受这些内置模块名，由 Node 运行时解析。
    webpack: (config, { isServer }) => {
        const fallbacks = {
            net: false,
            tls: false,
            dns: false,
            url: false,
            // 同样让 webpack 接受 lib/oss.ts 用到的 http/https 内置模块
            // (ali-oss 已被 serverExternalPackages 排除，但 Node http/https 也得 fallback)
            http: false,
            https: false,
        }
        if (isServer) {
            config.resolve = config.resolve || {}
            config.resolve.fallback = {
                ...(config.resolve.fallback || {}),
                ...fallbacks,
            }
        } else {
            // client 端绝不能打进 net/tls/dns：让 webpack 报"未使用"也不算错
            // 用 stub 代替，运行时不会被执行（NEXT_RUNTIME 守卫）
            config.resolve = config.resolve || {}
            config.resolve.fallback = {
                ...(config.resolve.fallback || {}),
                ...fallbacks,
            }
        }
        return config
    },
}

export default nextConfig