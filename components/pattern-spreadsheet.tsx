"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Save, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createPattern, deletePatternsBatch, getGallerySnapshot, updatePatternsBatch, type SpreadsheetPatternUpdate } from "@/app/actions/patterns"
import { MultiImageUpload } from "@/components/multi-image-upload"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DEFAULT_STUDIOS } from "@/lib/constants"
import type { GalleryPattern } from "@/lib/gallery-types"
import { cn } from "@/lib/utils"

type SpreadsheetRow = {
  id: number
  name: string
  studio: string
  categories: string[]
  categoriesText: string
  imageUrls: string[]
  fileUrl: string | null
  fileName: string | null
  cloudDriveUrl: string
  note: string
}

type TagRecord = { id: number; name: string; color: string; sortOrder: number }

function toRow(pattern: GalleryPattern): SpreadsheetRow {
  return {
    id: pattern.id,
    name: pattern.name,
    studio: pattern.studio,
    categories: [...pattern.categories],
    categoriesText: pattern.categories.join("，"),
    imageUrls: [...pattern.imageUrls],
    fileUrl: pattern.fileUrl,
    fileName: pattern.fileName,
    cloudDriveUrl: pattern.cloudDriveUrl ?? "",
    note: pattern.note ?? "",
  }
}

function sameEditableFields(a: SpreadsheetRow | undefined, b: SpreadsheetRow) {
  return !!a && a.name === b.name && a.studio === b.studio &&
    a.cloudDriveUrl === b.cloudDriveUrl && a.note === b.note &&
    a.fileUrl === b.fileUrl && a.fileName === b.fileName &&
    JSON.stringify(a.categories) === JSON.stringify(b.categories) &&
    JSON.stringify(a.imageUrls) === JSON.stringify(b.imageUrls)
}

function toUpdate(row: SpreadsheetRow): SpreadsheetPatternUpdate {
  return {
    id: row.id,
    name: row.name,
    studio: row.studio,
    categories: row.categories,
    images: row.imageUrls,
    cloudDriveUrl: row.cloudDriveUrl || null,
    note: row.note || null,
  }
}

function inputTags(value: string) {
  return [...new Set(value.split(/[,，;；]/).map((tag) => tag.trim()).filter(Boolean))]
}

export function PatternSpreadsheet({
  initialPatterns,
  initialTags,
}: {
  initialPatterns: GalleryPattern[]
  initialTags: TagRecord[]
}) {
  const [rows, setRows] = useState(() => initialPatterns.map(toRow))
  const [savedRows, setSavedRows] = useState(() => initialPatterns.map(toRow))
  const [tags, setTags] = useState(initialTags)
  const [studio, setStudio] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [savingIds, setSavingIds] = useState<Set<number>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [studioNavCollapsed, setStudioNavCollapsed] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[] | null>(null)

  const savedById = useMemo(() => new Map(savedRows.map((row) => [row.id, row])), [savedRows])
  const dirtyRows = useMemo(
    () => rows.filter((row) => !sameEditableFields(savedById.get(row.id), row)),
    [rows, savedById],
  )
  const studios = useMemo(() => {
    const values = new Set<string>(DEFAULT_STUDIOS)
    rows.forEach((row) => values.add(row.studio))
    return [...values].filter(Boolean)
  }, [rows])
  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    return rows.filter((row) => {
      if (studio !== "all" && row.studio !== studio) return false
      if (!query) return true
      return [row.name, row.studio, row.categoriesText, row.cloudDriveUrl, row.note, row.fileName]
        .some((value) => value?.toLocaleLowerCase().includes(query))
    })
  }, [rows, searchQuery, studio])
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)
  const visibleIds = visibleRows.map((row) => row.id)
  const selectedCount = selectedIds.size
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  useEffect(() => setPage(1), [studio, pageSize, searchQuery])
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount])

  // 其他设备的改动会定时同步；本机有未保存内容时保留草稿，不覆盖输入。
  useEffect(() => {
    let disposed = false
    const refresh = async () => {
      if (document.hidden || dirtyRows.length > 0 || bulkBusy) return
      try {
        const snapshot = await getGallerySnapshot()
        if (disposed) return
        const nextRows = snapshot.patterns.map(toRow)
        setRows(nextRows)
        setSavedRows(nextRows)
        setTags(snapshot.tags)
      } catch (error) {
        console.warn("[spreadsheet] Background refresh failed", error)
      }
    }
    const timer = window.setInterval(refresh, 15_000)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      disposed = true
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [dirtyRows.length, bulkBusy])

  function changeRow(id: number, change: Partial<SpreadsheetRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...change } : row))
  }

  function setRowsSaved(saved: SpreadsheetRow[]) {
    const byId = new Map(saved.map((row) => [row.id, row]))
    setSavedRows((current) => current.map((row) => byId.get(row.id) ?? row))
  }

  function mergeTags(names: string[]) {
    setTags((current) => {
      const known = new Set(current.map((tag) => tag.name))
      let nextId = current.reduce((minimum, tag) => Math.min(minimum, tag.id), 0) - 1
      let nextOrder = current.reduce((maximum, tag) => Math.max(maximum, tag.sortOrder), 0)
      const added = names.filter((name) => name && !known.has(name)).map((name) => ({
        id: nextId--,
        name,
        color: "slate",
        sortOrder: ++nextOrder,
      }))
      return added.length ? [...current, ...added] : current
    })
  }

  async function saveRows(target: SpreadsheetRow[]) {
    if (target.length === 0 || bulkBusy) return
    setBulkBusy(true)
    setSavingIds(new Set(target.map((row) => row.id)))
    try {
      const newRows = target.filter((row) => row.id < 0)
      const existingRows = target.filter((row) => row.id > 0)
      const invalidDraft = newRows.find((row) => !row.name.trim() || !row.studio.trim() || row.imageUrls.length === 0)
      if (invalidDraft) {
        throw new Error(!invalidDraft.name.trim() ? "请填写纸样名称" : !invalidDraft.studio.trim() ? "请选择工作室" : "请先为新纸样上传图片")
      }
      const createdRows: SpreadsheetRow[] = []
      for (const row of newRows) {
        const result = await createPattern({
          name: row.name,
          studio: row.studio,
          categories: row.categories,
          images: row.imageUrls,
          cloudDriveUrl: row.cloudDriveUrl || null,
          note: row.note || null,
        })
        if (!result.id) throw new Error(`「${row.name || "新纸样"}」创建失败`)
        createdRows.push({ ...row, id: result.id })
      }
      if (existingRows.length > 0) await updatePatternsBatch(existingRows.map(toUpdate))
      const replacements = new Map(createdRows.map((row, index) => [newRows[index]!.id, row]))
      if (createdRows.length > 0) {
        setRows((current) => current.map((row) => replacements.get(row.id) ?? row))
        setSavedRows((current) => [...current, ...createdRows])
      }
      setRowsSaved(existingRows)
      mergeTags(target.flatMap((row) => row.categories))
      toast.success(target.length === 1 ? (newRows.length ? "纸样已添加" : "已保存") : `已保存 ${target.length} 条纸样`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSavingIds(new Set())
      setBulkBusy(false)
    }
  }

  function deleteRows(ids: number[]) {
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length === 0 || bulkBusy) return
    setPendingDeleteIds(uniqueIds)
  }

  async function confirmDeleteRows() {
    const uniqueIds = pendingDeleteIds
    if (!uniqueIds?.length || bulkBusy) return
    setBulkBusy(true)
    try {
      const drafts = uniqueIds.filter((id) => id < 0)
      const deletedIds = await deletePatternsBatch(uniqueIds.filter((id) => id > 0))
      const deleted = new Set([...drafts, ...deletedIds])
      setRows((current) => current.filter((row) => !deleted.has(row.id)))
      setSavedRows((current) => current.filter((row) => !deleted.has(row.id)))
      setSelectedIds((current) => new Set([...current].filter((id) => !deleted.has(id))))
      setPendingDeleteIds(null)
      toast.success(`已删除 ${drafts.length + deletedIds.length} 条纸样`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败")
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-2">
          <div className="flex items-center gap-3">
            <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))} aria-label="返回纸样库">
              <ArrowLeft className="size-4" />
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="font-serif text-lg font-semibold">在线表格</h1>
              <div className="relative w-40 sm:w-60">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索纸样"
                  aria-label="搜索纸样"
                  className="h-8 pl-8"
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px] gap-5 px-5 py-5">
        <aside className={cn("sticky top-[61px] hidden h-[calc(100vh-80px)] shrink-0 self-start overflow-y-auto rounded-xl border border-border bg-card p-2 transition-[width] md:block", studioNavCollapsed ? "w-12" : "w-44")}>
          <div className={cn("mb-2 flex items-center", studioNavCollapsed ? "justify-center" : "justify-between px-2")}>
            {!studioNavCollapsed && <h2 className="text-sm font-semibold">工作室</h2>}
            <button
              type="button"
              onClick={() => setStudioNavCollapsed((collapsed) => !collapsed)}
              aria-label={studioNavCollapsed ? "展开工作室导航" : "折叠工作室导航"}
              title={studioNavCollapsed ? "展开导航" : "折叠导航"}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {studioNavCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setStudio("all")}
            title="全部纸样"
            className={cn("mb-1 flex w-full items-center rounded-lg py-2 text-sm", studioNavCollapsed ? "justify-center px-1" : "justify-between px-3 text-left", studio === "all" ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:bg-muted")}
          >
            <span>{studioNavCollapsed ? "全" : "全部纸样"}</span>{!studioNavCollapsed && <span>{rows.length}</span>}
          </button>
          {studios.map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setStudio(value)}
              title={value}
              className={cn("mb-1 flex w-full items-center rounded-lg py-2 text-sm", studioNavCollapsed ? "justify-center px-1" : "justify-between px-3 text-left", studio === value ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              <span className="truncate">{studioNavCollapsed ? value.slice(0, 1) : value}</span>
              {!studioNavCollapsed && <span>{rows.filter((row) => row.studio === value).length}</span>}
            </button>
          ))}
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">当前 {filteredRows.length} 条</span>
              <Button size="sm" variant="outline" onClick={() => {
                const id = rows.reduce((minimum, row) => Math.min(minimum, row.id), 0) - 1
                const defaultStudio = studio !== "all" ? studio : (studios[0] ?? DEFAULT_STUDIOS[0] ?? "")
                const draft: SpreadsheetRow = {
                  id, name: "", studio: defaultStudio, categories: [], categoriesText: "",
                  imageUrls: [], fileUrl: null, fileName: null, cloudDriveUrl: "", note: "",
                }
                setRows((current) => [draft, ...current])
                setPage(1)
              }} disabled={bulkBusy}>
                <Plus className="size-3.5" />添加纸样
              </Button>
              <Button size="sm" onClick={() => void saveRows(dirtyRows)} disabled={dirtyRows.length === 0 || bulkBusy}>
                <Save className="size-3.5" />批量保存{dirtyRows.length ? `（${dirtyRows.length}）` : ""}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void deleteRows([...selectedIds])} disabled={selectedCount === 0 || bulkBusy}>
                <Trash2 className="size-3.5" />批量删除{selectedCount ? `（${selectedCount}）` : ""}
              </Button>
              {dirtyRows.length > 0 && <span className="text-xs text-amber-700">有 {dirtyRows.length} 条未保存</span>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                每页
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="h-8 rounded-lg border border-input bg-background px-2 text-foreground"
                >
                  {[10, 15, 20].map((size) => <option key={size} value={size}>{size} 条</option>)}
                </select>
              </label>
              <span className="whitespace-nowrap text-sm text-muted-foreground">第 {page} / {pageCount} 页</span>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft className="size-4" />上一页
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                下一页<ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[1120px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-10" />
                <col className="w-44" />
                <col className="w-24" />
                <col className="w-32" />
                <col />
                <col className="w-56" />
                <col className="w-14" />
                <col className="w-28" />
              </colgroup>
              <thead className="bg-muted text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="选择当前页"
                      checked={allVisibleSelected}
                      onChange={(event) => setSelectedIds((current) => {
                        const next = new Set(current)
                        for (const id of visibleIds) event.target.checked ? next.add(id) : next.delete(id)
                        return next
                      })}
                    />
                  </th>
                  <th className="w-44 px-3 py-3">名称</th>
                  <th className="w-24 px-3 py-3">工作室</th>
                  <th className="w-32 px-3 py-3">标签</th>
                  <th className="px-3 py-3">图片</th>
                  <th className="w-56 px-3 py-3">网盘链接</th>
                  <th className="w-14 px-3 py-3">备注</th>
                  <th className="sticky right-0 z-20 w-28 bg-muted px-3 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const dirty = !sameEditableFields(savedById.get(row.id), row)
                  return (
                    <tr key={row.id} className={cn("border-b border-border last:border-0", dirty && "bg-amber-50/50")}>
                      <td className="px-3 py-2 align-middle">
                        <input
                          type="checkbox"
                          className="align-middle"
                          aria-label={`选择${row.name}`}
                          checked={selectedIds.has(row.id)}
                          onChange={(event) => setSelectedIds((current) => {
                            const next = new Set(current)
                            event.target.checked ? next.add(row.id) : next.delete(row.id)
                            return next
                          })}
                        />
                      </td>
                      <td className="px-2 py-2 align-middle"><Input value={row.name} onChange={(event) => changeRow(row.id, { name: event.target.value })} aria-label="名称" /></td>
                      <td className="w-24 px-2 py-2 align-middle">
                        <select
                          value={row.studio}
                          onChange={(event) => changeRow(row.id, { studio: event.target.value })}
                          aria-label="工作室"
                          className="h-8 w-full max-w-24 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          {[...new Set([...studios, row.studio])].map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <Input value={row.categoriesText} onChange={(event) => changeRow(row.id, { categoriesText: event.target.value, categories: inputTags(event.target.value) })} aria-label="标签，使用逗号分隔" placeholder="标签用逗号分隔" />
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <MultiImageUpload
                          label=""
                          compact
                          values={row.imageUrls}
                          onChange={(imageUrls) => changeRow(row.id, { imageUrls })}
                        />
                      </td>
                      <td className="px-2 py-2 align-middle"><Input value={row.cloudDriveUrl} onChange={(event) => changeRow(row.id, { cloudDriveUrl: event.target.value })} aria-label="网盘链接" /></td>
                      <td className="w-14 max-w-14 px-2 py-2 align-middle"><Textarea value={row.note} onChange={(event) => changeRow(row.id, { note: event.target.value })} aria-label="备注" className="min-h-8 resize-y" /></td>
                      <td className={cn("sticky right-0 z-10 w-28 px-2 py-2 align-middle", dirty ? "bg-amber-50/50" : "bg-card")}>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" aria-label={`保存${row.name}`} title="保存此行" disabled={!dirty || bulkBusy} onClick={() => void saveRows([row])} className="bg-primary text-white hover:bg-primary/90">
                            {savingIds.has(row.id) && <span className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent" />}
                            保存
                          </Button>
                          <Button size="icon-sm" variant="destructive" aria-label={`删除${row.name}`} title="删除此行" disabled={bulkBusy} onClick={() => void deleteRows([row.id])}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {visibleRows.length === 0 && <tr><td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">没有纸样信息</td></tr>}
              </tbody>
            </table>
          </div>

        </main>
      </div>

      <Dialog open={pendingDeleteIds !== null} onOpenChange={(open) => !open && !bulkBusy && setPendingDeleteIds(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">删除纸样</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定删除{pendingDeleteIds?.length === 1 ? "这条" : `选中的 ${pendingDeleteIds?.length ?? 0} 条`}纸样信息吗？此操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteIds(null)} disabled={bulkBusy}>取消</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteRows()} disabled={bulkBusy}>
              {bulkBusy ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
