"use client"

import { useEffect, useState } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [chunkReloadAttempted, setChunkReloadAttempted] = useState(false)
  const isChunkLoadError = /Loading chunk \d+ failed|ChunkLoadError|chunk.*failed|Failed to load.*chunk/i.test(
    error.message,
  )

  useEffect(() => {
    if (!isChunkLoadError) return

    // A deployment can replace the HTML and its chunk manifest while a tab
    // still holds an older route. Reload once to fetch the active deployment.
    const recoveryKey = "chunk-load-recovery-at"
    try {
      const previousAttempt = Number(sessionStorage.getItem(recoveryKey) || 0)
      if (Date.now() - previousAttempt > 30_000) {
        sessionStorage.setItem(recoveryKey, String(Date.now()))
        setChunkReloadAttempted(true)
        window.location.reload()
        return
      }
    } catch {
      // Continue to the manual refresh button when session storage is blocked.
    }
    setChunkReloadAttempted(true)
  }, [isChunkLoadError])

  return (
    <div style={{ padding: "2rem", fontFamily: "monospace", fontSize: "14px" }}>
      <h2 style={{ color: "red" }}>Server Error</h2>
      <p>{error.message}</p>
      <p>digest: {error.digest}</p>
      {isChunkLoadError ? (
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}
        >
          {chunkReloadAttempted ? "刷新页面" : "正在刷新页面…"}
        </button>
      ) : (
        <button onClick={reset} style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}>
          重试
        </button>
      )}
    </div>
  )
}
