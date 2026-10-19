"use server"

import {
  ADMIN_EMAIL,
  clearAdminSession,
  createAdminSession,
  verifyAdminCredentials,
} from "@/lib/admin-auth"

export async function loginAdmin(email: string, password: string) {
  try {
    const valid = await verifyAdminCredentials(email, password)
    if (!valid) return { success: false as const, error: "密码错误" }
    await createAdminSession()
    return { success: true as const, email: ADMIN_EMAIL }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("管理员登录未配置：")) {
      return { success: false as const, error: error.message }
    }
    return { success: false as const, error: "登录暂时不可用，请稍后重试" }
  }
}

export async function logoutAdmin() {
  await clearAdminSession()
}
