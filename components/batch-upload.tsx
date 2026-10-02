"use client"

import { AlertCircle, CheckCircle2, Download, FileUp, Images, Loader2, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { type PatternInput } from "@/app/actions/patterns"
import { Button } from "@/components/ui/button"
import { prefetchSignedParams, uploadDirectToOssFast } from "@/lib/direct-upload"
import { compressImageFile } from "@/lib/image-compress"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ CSV 工具 */

const TEMPLATE_HEADERS = [
  "名称",
  "工作室",
  "品类标签",
  "缩略图文件名",
  "尺码表文件名",
  "电子文件名",
  "备注",
] as const

// 一行示例数据，帮助用户理解格式
const TEMPLATE_EXAMPLE = [
  "法式泡泡袖衬衫",
  "卫兰纸样",
  "上衣;女",
  "shirt.png",
  "shirt-size.png",
  "shirt.pdf",
  "春夏新款",
]

function toCsv(rows: string[][]) {
  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  return rows.map((r) => r.map(escape).join(",")).join("\r\n")
}

// 简单但支持引号转义的 CSV 解析
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  // 去掉 BOM
  const s = text.replace(/^\uFEFF/, "")
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

function splitTags(raw: string): string[] {
  return raw
    .split(/[;；,，]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/* ------------------------------------------------------------------ 类型 */

type ParsedRow = {
  index: number
  name: string
  studio: string
  categories: string[]
  thumbnailName: string
  sizeChartName: string
  fileName: string
  note: string
  errors: string[]
}

export type BatchUploadItem = PatternInput

async function uploadOne(file: File, folder: "images" | "files") {
  // 签名 + 压缩 + 上传 三阶段最大并行（pipeline 版）
  return uploadDirectToOssFast(
    file,
    folder,
    folder === "images" ? async (f) => (await compressImageFile(f)).file : undefined,
  )
}

/* ------------------------------------------------------------------ 组件 */

export function BatchUpload({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /**
   * 乐观更新：父组件负责写 server + 更新本地列表。
   * 这里在文件全部上传完后立刻关闭弹窗、回传数据，不再 await 远程批量写入。
   */
  onDone: (items: BatchUploadItem[]) => void
}) {
  const csvInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<ParsedRow[]>([])
  const [csvName, setCsvName] = useState<string | null>(null)
  const [files, setFiles] = useState<Map<string, File>>(new Map())
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  // 打开弹窗时立刻预热两种 folder 的签名，消除首次上传延迟
  useEffect(() => {
    if (!open) return
    prefetchSignedParams("images")
    prefetchSignedParams("files")
  }, [open])

  const reset = () => {
    setRows([])
    setCsvName(null)
    setFiles(new Map())
    setProgress({ done: 0, total: 0 })
  }

  function handleClose(v: boolean) {
    if (importing) return
    if (!v) reset()
    onOpenChange(v)
  }

  function downloadTemplate() {
    const csv = toCsv([[...TEMPLATE_HEADERS], TEMPLATE_EXAMPLE])
    // 加 BOM 保证 Excel 正确识别中文
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "纸样批量上传模版.csv"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handleCsv(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result))
      if (parsed.length < 2) {
        toast.error("模版内容为空或缺少数据行")
        return
      }
      const [, ...dataRows] = parsed
      const out: ParsedRow[] = dataRows.map((cols, i) => {
        const [name = "", studio = "", tags = "", thumb = "", size = "", file = "", note = ""] =
          cols.map((c) => c.trim())
        return {
          index: i + 1,
          name,
          studio,
          categories: splitTags(tags),
          thumbnailName: thumb,
          sizeChartName: size,
          fileName: file,
          note,
          errors: [],
        }
      })
      setRows(out)
      setCsvName(file.name)
    }
    reader.readAsText(file, "utf-8")
  }

  function handleFiles(list: FileList) {
    const map = new Map(files)
    Array.from(list).forEach((f) => map.set(f.name, f))
    setFiles(map)
  }

  // 校验（依赖已选文件）
  const validatedRows = useMemo(() => {
    return rows.map((r) => {
      const errors: string[] = []
      if (!r.name) errors.push("缺少名称")
      if (!r.studio) errors.push("缺少工作室")
      if (!r.thumbnailName) errors.push("缺少缩略图文件名")
      else if (!files.has(r.thumbnailName))
        errors.push(`未找到缩略图「${r.thumbnailName}」`)
      if (r.sizeChartName && !files.has(r.sizeChartName))
        errors.push(`未找到尺码表「${r.sizeChartName}」`)
      if (r.fileName && !files.has(r.fileName))
        errors.push(`未找到电子文件「${r.fileName}」`)
      return { ...r, errors }
    })
  }, [rows, files])

  const validCount = validatedRows.filter((r) => r.errors.length === 0).length
  const canImport = validCount > 0 && !importing

  async function startImport() {
    const valid = validatedRows.filter((r) => r.errors.length === 0)
    if (valid.length === 0) return
    setImporting(true)
    setProgress({ done: 0, total: valid.length })

    // 缓存已上传文件，避免同名文件重复上传
    const uploaded = new Map<string, Promise<string>>()

    // 限流并发：避免一次性跑太多压缩+上传把浏览器卡死
    // 16 并发：现代浏览器能轻松扛住，对服务端/网络没有压力（每个都是单 PUT）
    // 跨洲跨境场景下，并发数越高越能填满 TCP 单连接窗口（slow start 之后）
    const MAX_CONCURRENT = 16
    const queue = valid.slice()
    const results: Array<PromiseSettledResult<{
      r: (typeof valid)[number]
      thumbnailUrl: string
      sizeChartUrl: string | null
      fileUrl: string | null
    }>> = new Array(valid.length)

    const uploadOneQueued = async (file: File, folder: "images" | "files"): Promise<string> => {
      // 同一个文件名复用（同一份 File 可能被多行引用）
      const cached = uploaded.get(`${folder}:${file.name}`)
      if (cached) return cached
      const p = uploadOne(file, folder)
      uploaded.set(`${folder}:${file.name}`, p)
      return p
    }

    async function processRow(idx: number, r: (typeof valid)[number]) {
      try {
        // 同一行的 3 个文件可能都未上传，并行启动（各自的 cache 兜住）
        const [thumbnailUrl, sizeChartUrl, fileUrl] = await Promise.all([
          uploadOneQueued(files.get(r.thumbnailName)!, "images"),
          r.sizeChartName ? uploadOneQueued(files.get(r.sizeChartName)!, "images") : Promise.resolve(null),
          r.fileName ? uploadOneQueued(files.get(r.fileName)!, "files") : Promise.resolve(null),
        ])
        results[idx] = {
          status: "fulfilled",
          value: { r, thumbnailUrl, sizeChartUrl, fileUrl },
        }
      } catch (e) {
        results[idx] = { status: "rejected", reason: e }
      } finally {
        setProgress((p) => ({ ...p, done: p.done + 1 }))
      }
    }

    // 启动 N 个 worker，每个 worker 取一个 row 处理；处理完再取下一个直到 queue 空
    const worker = async () => {
      while (queue.length) {
        const r = queue.shift()!
        const idx = valid.indexOf(r)
        await processRow(idx, r)
      }
    }
    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENT, valid.length) },
      () => worker(),
    )
    await Promise.all(workers)

    // 收集成功项
    const inputs: PatternInput[] = []
    const failed: string[] = []
    for (let i = 0; i < results.length; i++) {
      const item = results[i]
      if (item.status === "fulfilled") {
        const { r, thumbnailUrl, sizeChartUrl, fileUrl } = item.value
        inputs.push({
          name: r.name,
          studio: r.studio,
          categories: r.categories,
          thumbnailUrl,
          sizeChartUrl,
          fileUrl,
          fileName: r.fileName || null,
          note: r.note || null,
        })
      } else {
        failed.push(valid[i].name)
      }
    }

    if (inputs.length === 0) {
      toast.error("全部上传失败，请检查网络后重试")
      return
    }

    if (failed.length > 0) {
      toast.warning(`有 ${failed.length} 个纸样上传失败，已跳过：${failed.join("、")}`)
    }

    // 乐观更新：立刻关闭弹窗，把数据交给父组件显示
    toast.success(`成功导入 ${inputs.length} 个纸样`)
    const items = inputs.slice()
    reset()
    onOpenChange(false)
    onDone(items)
  }

  const hasRows = validatedRows.length > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="font-serif">批量上传纸样</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[calc(88vh-8.5rem)] flex-col gap-5 overflow-y-auto px-6 py-5">
          {/* 步骤 1：下载模版 */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              1. 下载并填写模版
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              下载 CSV 模版，按列填写纸样信息。品类标签用分号
              <span className="mx-0.5 rounded bg-muted px-1">;</span>
              分隔。图片 / 电子文件列填写<strong>文件名</strong>
              （如 shirt.png），稍后一起选择这些文件即可自动匹配。缩略图为必填。
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
              className="self-start"
            >
              <Download className="mr-1.5 size-4" />
              下载模版
            </Button>
          </section>

          {/* 步骤 2：上传 CSV */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              2. 上传填好的模版
            </h3>
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/50 px-4 py-3 text-left text-sm transition-colors hover:border-primary hover:bg-accent/40"
            >
              <FileUp className="size-5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {csvName ? (
                  <span className="text-foreground">{csvName}</span>
                ) : (
                  "点击选择 CSV 模版文件"
                )}
              </span>
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleCsv(f)
                e.target.value = ""
              }}
            />
          </section>

          {/* 步骤 3：选择图片 / 文件 */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              3. 选择图片与电子文件
            </h3>
            <button
              type="button"
              onClick={() => filesInputRef.current?.click()}
              className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/50 px-4 py-3 text-left text-sm transition-colors hover:border-primary hover:bg-accent/40"
            >
              <Images className="size-5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {files.size > 0 ? (
                  <span className="text-foreground">已选择 {files.size} 个文件</span>
                ) : (
                  "点击选择模版中引用的所有图片 / 文件（可多选）"
                )}
              </span>
            </button>
            <input
              ref={filesInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files)
                e.target.value = ""
              }}
            />
          </section>

          {/* 预览表 */}
          {hasRows && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  预览（{validCount}/{validatedRows.length} 条可导入）
                </h3>
              </div>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">状态</th>
                      <th className="px-3 py-2 text-left font-medium">名称</th>
                      <th className="px-3 py-2 text-left font-medium">工作室</th>
                      <th className="px-3 py-2 text-left font-medium">品类</th>
                      <th className="px-3 py-2 text-left font-medium">说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {validatedRows.map((r) => {
                      const ok = r.errors.length === 0
                      return (
                        <tr key={r.index} className={cn(!ok && "bg-destructive/5")}>
                          <td className="px-3 py-2">
                            {ok ? (
                              <CheckCircle2 className="size-4 text-primary" />
                            ) : (
                              <AlertCircle className="size-4 text-destructive" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-foreground">
                            {r.name || <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {r.studio || "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {r.categories.join("、") || "—"}
                          </td>
                          <td className="px-3 py-2">
                            {ok ? (
                              <span className="text-muted-foreground">就绪</span>
                            ) : (
                              <span className="text-destructive">
                                {r.errors.join("；")}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {importing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在导入 {progress.done}/{progress.total}…
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={importing}>
            <X className="mr-1.5 size-4" />
            取消
          </Button>
          <Button onClick={startImport} disabled={!canImport}>
            {importing ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                导入中…
              </>
            ) : (
              `导入 ${validCount} 个纸样`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
