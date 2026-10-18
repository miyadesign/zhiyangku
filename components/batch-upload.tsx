"use client"

import { AlertCircle, CheckCircle2, Download, FileUp, Images, Loader2, X } from "lucide-react"
import { strToU8, unzipSync, zipSync } from "fflate"
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

/* -------------------------------------------------------------- Excel 工具 */

const TEMPLATE_HEADERS = [
  "名称",
  "工作室",
  "品类标签",
  "图1",
  "图2",
  "图3",
  "图4",
  "图5",
  "电子文件名",
  "备注",
] as const

// 一行示例数据，帮助用户理解格式
const TEMPLATE_EXAMPLE = [
  "法式泡泡袖衬衫",
  "卫兰纸样",
  "上衣;女",
  "",
  "",
  "",
  "",
  "",
  "shirt.pdf",
  "春夏新款",
]

function xmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function createExcelTemplate() {
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="纸样清单" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const headerCells = [...TEMPLATE_HEADERS].map((header, i) => {
    const ref = `${String.fromCharCode(65 + i)}1`
    return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(header)}</t></is></c>`
  }).join("")
  const exampleCells = TEMPLATE_EXAMPLE.map((value, i) => {
    const ref = `${String.fromCharCode(65 + i)}2`
    return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
  }).join("")
  const widths = [24, 20, 22, 16, 16, 16, 16, 16, 24, 28]
    .map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`)
    .join("")
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="72"/><cols>${widths}</cols><sheetData><row r="1" ht="25" customHeight="1">${headerCells}</row><row r="2">${exampleCells}</row></sheetData><autoFilter ref="A1:J2"/></worksheet>`
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(workbookXml),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
  })
}

function columnIndex(ref: string) {
  const letters = ref.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A"
  return [...letters].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1
}

function resolveZipPath(source: string, target: string) {
  const parts = target.startsWith("/") ? [] : source.split("/").slice(0, -1)
  for (const part of target.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") parts.pop()
    else parts.push(part)
  }
  return parts.join("/")
}

function relationshipsPath(source: string) {
  const parts = source.split("/")
  const name = parts.pop()!
  return [...parts, "_rels", `${name}.rels`].join("/")
}

function parseXml(data: Uint8Array) {
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(data), "application/xml")
  if (xml.querySelector("parsererror")) throw new Error("Excel 工作簿内容无效")
  return xml
}

function relationshipMap(xml: Document) {
  return new Map(
    Array.from(xml.getElementsByTagNameNS("*", "Relationship"), (node) => [
      node.getAttribute("Id") ?? "",
      node.getAttribute("Target") ?? "",
    ]),
  )
}

function firstChildByName(node: Element, name: string) {
  return Array.from(node.getElementsByTagNameNS("*", name))[0] ?? null
}

function attributeByLocalName(node: Element, name: string) {
  return Array.from(node.attributes).find((attribute) => attribute.localName === name)?.value
}

async function readExcel(file: File) {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const workbookPath = "xl/workbook.xml"
  const workbook = parseXml(archive[workbookPath])
  const firstSheet = workbook.getElementsByTagNameNS("*", "sheet")[0]
  if (!firstSheet) throw new Error("Excel 文件中没有工作表")
  const workbookRels = relationshipMap(parseXml(archive[relationshipsPath(workbookPath)]))
  const sheetPath = resolveZipPath(workbookPath, workbookRels.get(firstSheet.getAttribute("r:id") ?? "") ?? "")
  const sheet = parseXml(archive[sheetPath])
  const sharedStringsPath = "xl/sharedStrings.xml"
  const sharedStrings = archive[sharedStringsPath]
    ? Array.from(parseXml(archive[sharedStringsPath]).getElementsByTagNameNS("*", "si"), (item) =>
        Array.from(item.getElementsByTagNameNS("*", "t"), (text) => text.textContent ?? "").join(""),
      )
    : []
  const cellRows = new Map<number, Map<number, string>>()
  const cellImageIds = new Map<number, Map<number, string>>()
  for (const row of Array.from(sheet.getElementsByTagNameNS("*", "row"))) {
    const rowNumber = Number(row.getAttribute("r"))
    const values = new Map<number, string>()
    for (const cell of Array.from(row.getElementsByTagNameNS("*", "c"))) {
      const col = columnIndex(cell.getAttribute("r") ?? "A")
      const type = cell.getAttribute("t")
      const value = firstChildByName(cell, type === "inlineStr" ? "is" : "v")?.textContent ?? ""
      values.set(col, type === "s" ? (sharedStrings[Number(value)] ?? "") : value)
      const formula = firstChildByName(cell, "f")?.textContent ?? ""
      const imageMatch = formula.match(/DISPIMG\s*\(\s*["']?([^"',)]+)/i)
      if (imageMatch) {
        const cells = cellImageIds.get(rowNumber) ?? new Map<number, string>()
        cells.set(col, imageMatch[1])
        cellImageIds.set(rowNumber, cells)
      }
    }
    cellRows.set(rowNumber, values)
  }
  const header = cellRows.get(1)
  if (!header) throw new Error("表格第一行需要填写模板标题")
  const headers = new Map(Array.from(header, ([col, value]) => [value.trim(), col]))
  const requiredHeaders = ["名称", "工作室", "品类标签", "电子文件名", "备注"]
  for (const name of requiredHeaders) if (!headers.has(name)) throw new Error(`模板缺少“${name}”列`)
  const imageColumnToIndex = new Map<number, number>()
  for (let i = 1; i <= 5; i++) {
    const col = headers.get(`图${i}`)
    if (col !== undefined) imageColumnToIndex.set(col, i - 1)
  }

  const imageFiles = new Map<number, (File | null)[]>()
  const drawingNode = firstChildByName(sheet.documentElement, "drawing")
  if (drawingNode) {
    const drawingRelId = drawingNode.getAttribute("r:id") ?? ""
    const sheetRels = relationshipMap(parseXml(archive[relationshipsPath(sheetPath)]))
    const drawingPath = resolveZipPath(sheetPath, sheetRels.get(drawingRelId) ?? "")
    const drawing = parseXml(archive[drawingPath])
    const drawingRels = relationshipMap(parseXml(archive[relationshipsPath(drawingPath)]))
    const relTargets = new Map(Array.from(drawingRels, ([id, target]) => [id, resolveZipPath(drawingPath, target)]))
    for (const anchor of Array.from(drawing.documentElement.children)) {
      const from = firstChildByName(anchor, "from")
      const rowNode = from && firstChildByName(from, "row")
      const colNode = from && firstChildByName(from, "col")
      if (!rowNode || !colNode) continue
      const rowNumber = Number(rowNode.textContent) + 1
      const imageIndex = imageColumnToIndex.get(Number(colNode.textContent))
      if (imageIndex === undefined) continue
      const blip = firstChildByName(anchor, "blip")
      const embedId = blip?.getAttribute("r:embed")
      const mediaPath = embedId ? relTargets.get(embedId) : undefined
      const media = mediaPath ? archive[mediaPath] : undefined
      if (!media || !mediaPath) continue
      const mediaName = mediaPath.split("/").pop() ?? `image-${imageIndex + 1}.png`
      const extension = mediaName.split(".").pop()?.toLowerCase() ?? "png"
      const imageName = `row-${rowNumber}-image-${imageIndex + 1}.${extension}`
      const mime = extension === "jpg" ? "image/jpeg" : `image/${extension}`
      const images = imageFiles.get(rowNumber) ?? Array<File | null>(5).fill(null)
      images[imageIndex] = new File([media], imageName, { type: mime })
      imageFiles.set(rowNumber, images)
    }
  }

  // WPS and Excel's "place in cell" feature store image references as DISPIMG
  // formulas backed by xl/cellImages.xml instead of worksheet drawings.
  const cellImagesPath = Object.keys(archive).find((path) => path.toLowerCase() === "xl/cellimages.xml")
  if (cellImagesPath) {
    const cellImages = parseXml(archive[cellImagesPath])
    const cellImageRels = relationshipMap(parseXml(archive[relationshipsPath(cellImagesPath)]))
    const mediaByImageId = new Map<string, { path: string; data: Uint8Array }>()
    for (const picture of Array.from(cellImages.getElementsByTagNameNS("*", "cellImage"))) {
      const id = firstChildByName(picture, "cNvPr")?.getAttribute("name")
      const embedId = firstChildByName(picture, "blip") && attributeByLocalName(firstChildByName(picture, "blip")!, "embed")
      const target = embedId ? cellImageRels.get(embedId) : undefined
      const path = target ? resolveZipPath(cellImagesPath, target) : undefined
      const data = path ? archive[path] : undefined
      if (id && path && data) mediaByImageId.set(id, { path, data })
    }
    for (const [rowNumber, cells] of cellImageIds) {
      for (const [column, id] of cells) {
        const imageIndex = imageColumnToIndex.get(column)
        const media = mediaByImageId.get(id)
        if (imageIndex === undefined || !media) continue
        const mediaName = media.path.split("/").pop() ?? `image-${imageIndex + 1}.png`
        const extension = mediaName.split(".").pop()?.toLowerCase() ?? "png"
        const imageName = `row-${rowNumber}-image-${imageIndex + 1}.${extension}`
        const mime = extension === "jpg" ? "image/jpeg" : `image/${extension}`
        const images = imageFiles.get(rowNumber) ?? Array<File | null>(5).fill(null)
        images[imageIndex] = new File([media.data], imageName, { type: mime })
        imageFiles.set(rowNumber, images)
      }
    }
  }

  return Array.from(cellRows.entries())
    .filter(([rowNumber, values]) => rowNumber > 1 && Array.from(values.values()).some((value) => value.trim()))
    .map(([rowNumber, values], index) => {
      const get = (name: string) => values.get(headers.get(name) ?? -1)?.trim() ?? ""
      return {
        index: index + 1,
        name: get("名称"),
        studio: get("工作室"),
        categories: splitTags(get("品类标签")),
        imageFiles: imageFiles.get(rowNumber) ?? Array<File | null>(5).fill(null),
        fileName: get("电子文件名"),
        note: get("备注"),
        errors: [],
      }
    })
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
  /** 在预览表图1-图5单元格中直接选择的图片。 */
  imageFiles: (File | null)[]
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
  /** 文件上传完成后，等待父组件确认数据库批量写入成功。 */
  onDone: (items: BatchUploadItem[]) => Promise<void>
}) {
  const workbookInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<ParsedRow[]>([])
  const [workbookName, setWorkbookName] = useState<string | null>(null)
  const [files, setFiles] = useState<Map<string, File>>(new Map())
  const [importing, setImporting] = useState(false)
  const [savingRecords, setSavingRecords] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  // 打开弹窗时立刻预热两种 folder 的签名，消除首次上传延迟
  useEffect(() => {
    if (!open) return
    prefetchSignedParams("images")
    prefetchSignedParams("files")
  }, [open])

  const reset = () => {
    setRows([])
    setWorkbookName(null)
    setFiles(new Map())
    setImporting(false)
    setSavingRecords(false)
    setProgress({ done: 0, total: 0 })
  }

  function handleClose(v: boolean) {
    if (importing) return
    if (!v) reset()
    onOpenChange(v)
  }

  function downloadTemplate() {
    const workbook = createExcelTemplate()
    const blob = new Blob([workbook], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "纸样批量上传模版.xlsx"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleExcel(file: File) {
    try {
      const out = await readExcel(file)
      if (out.length === 0) {
        toast.error("表格中没有数据行")
        return
      }
      setRows(out)
      setWorkbookName(file.name)
      if (!out.some((row) => row.imageFiles.some(Boolean))) {
        toast.warning("已读取表格，但没有在图1-图5列识别到图片。请确认图片与对应行、图片列对齐，并保存为 .xlsx 格式。")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取 Excel 失败")
    }
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
      if (!r.imageFiles.some(Boolean)) errors.push("请在图1-图5中选择至少一张图片")
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
    setSavingRecords(false)
    try {
      type UploadTask = { file: File; folder: "images" | "files" }
      type RowTask = {
        row: (typeof valid)[number]
        imageTaskIds: number[]
        fileTaskId: number | null
      }
      type UploadResult = { key: string } | { error: unknown }

      const tasks: UploadTask[] = []
      const taskIds = new Map<File, Map<UploadTask["folder"], number>>()
      const addTask = (file: File, folder: UploadTask["folder"]) => {
        const existing = taskIds.get(file)?.get(folder)
        if (existing !== undefined) return existing
        const id = tasks.length
        tasks.push({ file, folder })
        const folders = taskIds.get(file) ?? new Map<UploadTask["folder"], number>()
        folders.set(folder, id)
        taskIds.set(file, folders)
        return id
      }

      const rowTasks: RowTask[] = valid.map((row) => ({
        row,
        imageTaskIds: row.imageFiles
          .filter((file): file is File => file !== null)
          .map((file) => addTask(file, "images")),
        fileTaskId: row.fileName ? addTask(files.get(row.fileName)!, "files") : null,
      }))
      setProgress({ done: 0, total: tasks.length })

      const results: UploadResult[] = new Array(tasks.length)
      let cursor = 0
      const worker = async () => {
        while (cursor < tasks.length) {
          const taskId = cursor++
          const task = tasks[taskId]
          try {
            results[taskId] = { key: await uploadOne(task.file, task.folder) }
          } catch (error) {
            results[taskId] = { error }
          } finally {
            setProgress((p) => ({ ...p, done: p.done + 1 }))
          }
        }
      }
      // 控制压缩和网络请求总并发，避免大量图片同时处理时浏览器和连接拥塞。
      await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, () => worker()))

      const inputs: PatternInput[] = []
      const failed: string[] = []
      for (const { row, imageTaskIds, fileTaskId } of rowTasks) {
        const imageResults = imageTaskIds.map((id) => results[id])
        const fileResult = fileTaskId === null ? null : results[fileTaskId]
        if (
          imageResults.some((result) => !result || "error" in result) ||
          (fileResult !== null && (!fileResult || "error" in fileResult))
        ) {
          failed.push(row.name)
          continue
        }
        inputs.push({
          name: row.name,
          studio: row.studio,
          categories: row.categories,
          images: imageResults.map((result) => (result as { key: string }).key),
          fileUrl: fileResult ? (fileResult as { key: string }).key : null,
          fileName: row.fileName || null,
          note: row.note || null,
        })
      }

      if (inputs.length === 0) {
        toast.error("全部上传失败，请检查网络后重试")
        return
      }

      if (failed.length > 0) {
        toast.warning(`有 ${failed.length} 个纸样上传失败，已跳过：${failed.join("、")}`)
      }

      const items = inputs.slice()
      setSavingRecords(true)
      await onDone(items)
      toast.success(`成功导入 ${items.length} 个纸样`)
      reset()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量上传失败，请重试")
    } finally {
      setImporting(false)
    }
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
              下载 Excel 模版，按列填写纸样信息。把图片插入图1-图5对应单元格（第一张图作为主图），品类标签用分号
              <span className="mx-0.5 rounded bg-muted px-1">;</span>
              分隔。支持浮在单元格上方的图片，也支持 Excel/WPS 的“置于单元格内”图片；请确保图片位于正确的图1-图5列和对应数据行中。
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

          {/* 步骤 2：上传 Excel */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              2. 上传填好的 Excel 表格
            </h3>
            <button
              type="button"
              onClick={() => workbookInputRef.current?.click()}
              className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/50 px-4 py-3 text-left text-sm transition-colors hover:border-primary hover:bg-accent/40"
            >
              <FileUp className="size-5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {workbookName ? (
                  <span className="text-foreground">{workbookName}</span>
                ) : (
                  "点击选择含有嵌入图片的 .xlsx 文件"
                )}
              </span>
            </button>
            <input
              ref={workbookInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleExcel(f)
                e.target.value = ""
              }}
            />
          </section>

          {/* 步骤 3：选择电子文件 */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              3. 选择电子文件（可选）
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
                  "点击选择 Excel 中填写了文件名的电子文件（可多选）"
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
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[1100px] text-xs">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">状态</th>
                      <th className="px-3 py-2 text-left font-medium">名称</th>
                      <th className="px-3 py-2 text-left font-medium">工作室</th>
                      <th className="px-3 py-2 text-left font-medium">品类</th>
                      {Array.from({ length: 5 }, (_, i) => (
                        <th key={i} className="min-w-36 px-3 py-2 text-left font-medium">
                          图{i + 1}{i === 0 ? "（主图）" : ""}
                        </th>
                      ))}
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
                          {r.imageFiles.map((image, imageIndex) => (
                            <td key={imageIndex} className="min-w-36 px-3 py-2">
                              {image ? (
                                <span className="block max-w-36 truncate text-foreground" title={image.name}>
                                  {image.name}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">未嵌入图片</span>
                              )}
                            </td>
                          ))}
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
              {savingRecords
                ? "正在保存纸样信息…"
                : `正在上传文件 ${progress.done}/${progress.total}…`}
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
