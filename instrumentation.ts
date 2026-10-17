/**
 * Keep Node-only networking code out of Edge/Workers bundles.
 * Next.js calls this hook for each runtime, so load the Node implementation only
 * when the current server runtime is Node.js.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return

    const { register } = await import("./instrumentation.node")
    await register()
}
