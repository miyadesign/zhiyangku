import "server-only"

import { cookies } from "next/headers"

export const ADMIN_EMAIL = "1294283908@qq.com"
const COOKIE_NAME = "zhiyangku_admin_session"
const SESSION_SECONDS = 7 * 24 * 60 * 60

function getSigningSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET
  const minimumLength = process.env.NODE_ENV === "production" ? 32 : 24
  if (!secret || secret.length < minimumLength) {
    throw new Error(`管理员登录未配置：${process.env.NODE_ENV === "production" ? "线上" : "本地开发"}请设置至少 ${minimumLength} 个字符的 ADMIN_SESSION_SECRET`)
  }
  return secret
}

async function getHmacKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSigningSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function sessionPayload(expiresAt: number) {
  return `${ADMIN_EMAIL}:${expiresAt}`
}

export async function createAdminSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getHmacKey(),
    new TextEncoder().encode(sessionPayload(expiresAt)),
  )
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, `${expiresAt}.${encodeBase64Url(new Uint8Array(signature))}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  })
}

export async function clearAdminSession() {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
}

export async function isAdmin() {
  try {
    const value = (await cookies()).get(COOKIE_NAME)?.value
    if (!value) return false
    const [expiryText, signatureText, extra] = value.split(".")
    if (!expiryText || !signatureText || extra !== undefined) return false
    const expiresAt = Number(expiryText)
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false
    return await crypto.subtle.verify(
      "HMAC",
      await getHmacKey(),
      decodeBase64Url(signatureText),
      new TextEncoder().encode(sessionPayload(expiresAt)),
    )
  } catch {
    return false
  }
}

export async function requireAdmin() {
  if (!(await isAdmin())) {
    throw new Error("仅管理员可以执行此操作，请先登录管理员账号")
  }
}

export async function verifyAdminCredentials(email: string, password: string) {
  const expectedPassword = process.env.ADMIN_PASSWORD
  const minimumLength = process.env.NODE_ENV === "production" ? 16 : 8
  if (!expectedPassword || expectedPassword.length < minimumLength || expectedPassword.length > 128) {
    throw new Error(`管理员登录未配置：${process.env.NODE_ENV === "production" ? "线上" : "本地开发"}请设置 ${minimumLength}–128 位的 ADMIN_PASSWORD`)
  }

  const normalizeEmail = (value: string) => value.trim().toLowerCase()
  if (normalizeEmail(email) !== ADMIN_EMAIL) return false
  if (password.length > 128) return false

  // Compare fixed-size digests to avoid returning early based on password bytes.
  const encoder = new TextEncoder()
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(password)),
    crypto.subtle.digest("SHA-256", encoder.encode(expectedPassword)),
  ])
  const actual = new Uint8Array(actualDigest)
  const expected = new Uint8Array(expectedDigest)
  let difference = 0
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index]! ^ expected[index]!
  }
  return difference === 0
}
