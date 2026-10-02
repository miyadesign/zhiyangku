"use client"

import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { createTag, deleteTag, updateTag } from "@/app/actions/tags"
import { TAG_COLOR_KEYS, TAG_COLORS, type TagColor } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type AdminTag = {
  id: number
  name: string
  color: string
  sortOrder: number
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (c: TagColor) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TAG_COLOR_KEYS.map((key) => {
        const c = TAG_COLORS[key]
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            title={c.label}
            aria-label={c.label}
            className={cn(
              "h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition",
              c.dot,
              active && "ring-2 ring-foreground",
            )}
          >
            {active && <Check className="mx-auto h-3.5 w-3.5 text-white" />}
          </button>
        )
      })}
    </div>
  )
}

export function TagManager({
  open,
  onOpenChange,
  tags,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  tags: AdminTag[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // 新增表单
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState<TagColor>("rose")

  // 编辑状态
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const [editColor, setEditColor] = useState<TagColor>("rose")

  async function handleCreate() {
    if (!newName.trim()) return toast.error("请填写标签名称")
    setBusy(true)
    try {
      await createTag(newName, newColor)
      toast.success("已添加标签")
      setNewName("")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败")
    } finally {
      setBusy(false)
    }
  }

  function startEdit(t: AdminTag) {
    setEditId(t.id)
    setEditName(t.name)
    setEditColor((t.color as TagColor) in TAG_COLORS ? (t.color as TagColor) : "slate")
  }

  async function handleUpdate() {
    if (editId == null) return
    if (!editName.trim()) return toast.error("请填写标签名称")
    setBusy(true)
    try {
      await updateTag(editId, { name: editName, color: editColor })
      toast.success("已保存")
      setEditId(null)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败")
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(t: AdminTag) {
    setBusy(true)
    try {
      await deleteTag(t.id)
      toast.success("已删除标签")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="font-serif">标签管理</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {/* 新增标签 */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <span className="text-sm font-medium text-foreground">新增标签</span>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="标签名称，例如：女童"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault()
                  handleCreate()
                }
              }}
            />
            <Button type="button" onClick={handleCreate} disabled={busy}>
              <Plus className="mr-1 h-4 w-4" />
              添加
            </Button>
          </div>
          <ColorPicker value={newColor} onChange={setNewColor} />
        </div>

        {/* 标签列表 */}
        <ul className="flex flex-col gap-2">
          {tags.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              还没有标签
            </li>
          )}
          {tags.map((t) => {
            const c = TAG_COLORS[(t.color as TagColor) in TAG_COLORS ? (t.color as TagColor) : "slate"]
            const editing = editId === t.id
            return (
              <li
                key={t.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                {editing ? (
                  <>
                    <div className="flex gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="icon"
                        onClick={handleUpdate}
                        disabled={busy}
                        aria-label="保存"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setEditId(null)}
                        aria-label="取消"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <ColorPicker value={editColor} onChange={setEditColor} />
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm",
                        c.bg,
                        c.text,
                      )}
                    >
                      {t.name}
                    </span>
                    <div className="ml-auto flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(t)}
                        aria-label={`编辑 ${t.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(t)}
                        disabled={busy}
                        aria-label={`删除 ${t.name}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}
