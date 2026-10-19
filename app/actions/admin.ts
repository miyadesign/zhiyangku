"use server"

import {
  ADMIN_EMAIL,
  clearAdminSession,
  createAdminSession,
  verifyAdminCredentials,
} from "@/lib/admin-auth"

export async function loginAdmin(email: string, password: string) {
  const valid = await verifyAdminCredentials(email, password)
  if (!valid) throw new Error("邮箱或密码不正确")
  await createAdminSession()
  return { email: ADMIN_EMAIL }
}

export async function logoutAdmin() {
  await clearAdminSession()
}
