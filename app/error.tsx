"use client"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ padding: "2rem", fontFamily: "monospace", fontSize: "14px" }}>
      <h2 style={{ color: "red" }}>Server Error</h2>
      <p>{error.message}</p>
      <p>digest: {error.digest}</p>
      <button onClick={reset} style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}>
        重试
      </button>
    </div>
  )
}
