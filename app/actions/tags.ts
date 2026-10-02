"use server"

import { and, eq, ne, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { queryDb } from "@/lib/db"
import { patterns, tags } from "@/lib/db/schema"

export async function createTag(name: string, color: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("请填写标签名称")

  await queryDb(async (db) => {
    const existing = await db.select().from(tags).where(eq(tags.name, trimmed))
    if (existing.length) throw new Error("该标签已存在")

    // 排到末尾
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${tags.sortOrder}), 0)` })
      .from(tags)

    await db.insert(tags).values({
      name: trimmed,
      color: color || "slate",
      sortOrder: (maxOrder ?? 0) + 1,
    })
  })

  revalidatePath("/")
}

export async function updateTag(
  id: number,
  input: { name: string; color: string },
) {
  const trimmed = input.name.trim()
  if (!trimmed) throw new Error("请填写标签名称")

  await queryDb(async (db) => {
    const [current] = await db.select().from(tags).where(eq(tags.id, id))
    if (!current) throw new Error("标签不存在")

    // 重名校验（排除自身）
    const dup = await db
      .select()
      .from(tags)
      .where(and(eq(tags.name, trimmed), ne(tags.id, id)))
    if (dup.length) throw new Error("该标签名已存在")

    await db
      .update(tags)
      .set({ name: trimmed, color: input.color || "slate" })
      .where(eq(tags.id, id))

    // 若名称变化，同步更新所有纸样中引用的旧标签名
    if (current.name !== trimmed) {
      await db
        .update(patterns)
        .set({
          categories: sql`array_replace(${patterns.categories}, ${current.name}, ${trimmed})`,
        })
        .where(sql`${current.name} = ANY(${patterns.categories})`)
    }
  })

  revalidatePath("/")
}

export async function deleteTag(id: number) {
  await queryDb(async (db) => {
    const [current] = await db.select().from(tags).where(eq(tags.id, id))
    if (!current) return

    await db.delete(tags).where(eq(tags.id, id))

    // 从所有纸样的分类里移除该标签
    await db
      .update(patterns)
      .set({
        categories: sql`array_remove(${patterns.categories}, ${current.name})`,
      })
      .where(sql`${current.name} = ANY(${patterns.categories})`)
  })

  revalidatePath("/")
}
