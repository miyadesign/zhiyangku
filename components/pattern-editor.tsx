"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  type PatternInput,
} from "@/app/actions/patterns"
import { type TagInfo, tagColorClasses } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ImageUpload } from "@/components/image-upload"
import { MultiImageUpload } from "@/components/multi-image-upload"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type EditablePattern = {
  id: number
  name: string
  studio: string
  categories: string[]
  /** 所有图片 key 数组，第一张是主图 */
  images: string[]
  fileUrl: string | null
  fileName: string | null
  note: string | null
}

export function PatternEditor({
  open,
  onOpenChange,
  pattern,
  studios,
  tags,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  pattern: EditablePattern | null
  studios: string[]
  tags: TagInfo[]
  /**
   * 乐观更新模式：父组件负责写 server + 更新本地列表。
   * 这里只做轻量校验、关闭弹窗、回传数据，不再 await 远程调用。
   */
  onSaved: (input: PatternInput) => void
}) {
  const isEdit = !!pattern
  const [name, setName] = useState(pattern?.name ?? "")
  const [studio, setStudio] = useState(pattern?.studio ?? studios[0] ?? "")
  const [newStudio, setNewStudio] = useState("")
  const [addingStudio, setAddingStudio] = useState(false)
  const [categories, setCategories] = useState<string[]>(
    pattern?.categories ?? [],
  )
  // 图片：统一为数组。第一张是主图。
  const [images, setImages] = useState<string[]>(pattern?.images ?? [])
  const [fileUrl, setFileUrl] = useState<string | null>(pattern?.fileUrl ?? null)
  const [fileName, setFileName] = useState<string | null>(
    pattern?.fileName ?? null,
  )
  const [note, setNote] = useState(pattern?.note ?? "")
  const [submitting, setSubmitting] = useState(false)

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }

  function handleSave() {
    const finalStudio = addingStudio ? newStudio.trim() : studio
    if (!name.trim()) return toast.error("请填写纸样名称")
    if (!finalStudio) return toast.error("请选择或填写工作室")
    if (images.length === 0) return toast.error("请至少上传一张纸样图片")

    const input: PatternInput = {
      name: name.trim(),
      studio: finalStudio,
      categories,
      images,
      fileUrl,
      fileName,
      note: note.trim() || null,
    }

    // 乐观更新：立刻关闭弹窗、把数据交给父组件，UI 不等服务端
    setSubmitting(true)
    onOpenChange(false)
    onSaved(input)
    // 不在这里 await / setSubmitting(false)，避免按钮状态被立刻复位造成可重复点击
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="font-serif">
            {isEdit ? "编辑纸样" : "新增纸样"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="p-name">纸样名称</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：法式泡泡袖衬衫"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>所属工作室</Label>
            {!addingStudio ? (
              <div className="flex flex-wrap gap-2">
                {studios.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStudio(s)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      studio === s
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-border bg-secondary text-secondary-foreground hover:bg-accent",
                    )}
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAddingStudio(true)}
                  className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  + 新工作室
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={newStudio}
                  onChange={(e) => setNewStudio(e.target.value)}
                  placeholder="输入新的工作室名称"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAddingStudio(false)
                    setNewStudio("")
                  }}
                >
                  取消
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>品类标签（可多选）</Label>
            {tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                还没有标签，请先在「标签管理」中添加。
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const active = categories.includes(t.name)
                  const c = tagColorClasses(t.color)
                  return (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => toggleCategory(t.name)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition-colors",
                        active
                          ? cn(c.bg, c.text, "border-transparent")
                          : "border-border bg-secondary text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {t.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <MultiImageUpload
            label="纸样图片（第一张为主图 / 缩略图）"
            values={images}
            onChange={setImages}
          />

          <ImageUpload
            label="电子版纸样文件（可选，PDF / 压缩包 / PLT 等）"
            variant="file"
            inputId="upload-file"
            value={fileUrl}
            fileName={fileName}
            hint="支持任意格式，供前台下载"
            onChange={(p, n) => {
              setFileUrl(p)
              setFileName(n ?? null)
            }}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="p-note">备注（可选）</Label>
            <Textarea
              id="p-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="尺码说明、面料建议等"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button type="button" onClick={handleSave} disabled={submitting}>
            {submitting ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
