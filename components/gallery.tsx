"use client"

import { Heart, LogIn, LogOut, Plus, Ruler, Search, Table2, Tags, Upload, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { loginAdmin, logoutAdmin } from "@/app/actions/admin"
import { createPattern, createPatternsBatch, deletePattern, getGallerySnapshot, updatePattern } from "@/app/actions/patterns"
import { PatternCard } from "@/components/pattern-card"
import { PatternModal } from "@/components/pattern-modal"
import { PatternEditor, type EditablePattern } from "@/components/pattern-editor"
import { BatchUpload, type BatchUploadItem } from "@/components/batch-upload"
import { TagManager, type AdminTag } from "@/components/tag-manager"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DEFAULT_STUDIOS, type TagInfo, tagColorClasses } from "@/lib/constants"
import { downloadSrc, type GalleryPattern } from "@/lib/gallery-types"
import { cn } from "@/lib/utils"

const FAVORITES_STORAGE_KEY = "zhiyangku:favorites:v1"

function downloadPattern(pattern: GalleryPattern) {
  if (!pattern.fileUrl) {
    toast.error("该纸样暂无电子版文件")
    return
  }
  const url = downloadSrc(pattern.fileUrl, pattern.fileName)
  const a = document.createElement("a")
  a.href = url
  a.click()
  document.body.removeChild(a)
}

export function Gallery({
  patterns: initialPatterns,
  tags,
  initialIsAdmin,
}: {
  patterns: GalleryPattern[]
  tags: AdminTag[]
  initialIsAdmin: boolean
}) {
  const [studio, setStudio] = useState<string>("all")
  const [categories, setCategories] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [active, setActive] = useState<GalleryPattern | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(() => new Set())
  const [favoritesLoaded, setFavoritesLoaded] = useState(false)
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [authBusy, setAuthBusy] = useState(false)

  // 收藏保存在当前浏览器中；与纸样数据分开，避免需要账号登录才能使用。
  useEffect(() => {
    const readFavorites = () => {
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]")
        const ids = Array.isArray(parsed)
          ? parsed.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
          : []
        setFavoriteIds(new Set(ids))
      } catch {
        setFavoriteIds(new Set())
      }
      setFavoritesLoaded(true)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === FAVORITES_STORAGE_KEY || event.key === null) readFavorites()
    }
    readFavorites()
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  useEffect(() => {
    if (!favoritesLoaded) return
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favoriteIds]))
    } catch {
      // 收藏仍可在当前页面使用；仅在浏览器存储不可用时无法跨刷新保留。
    }
  }, [favoriteIds, favoritesLoaded])

  // 本地可写的纸样列表（乐观更新）。首屏来自服务端数据，新增/编辑/删除时立刻改这里，
  // 后台 fire-and-forget 同步到 server（unstable_cache 命中时刷新几乎无感）。
  const [patterns, setPatterns] = useState<GalleryPattern[]>(initialPatterns)
  const [currentTags, setCurrentTags] = useState<AdminTag[]>(tags)
  useEffect(() => {
    setPatterns(initialPatterns)
  }, [initialPatterns])

  // 管理相关状态
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<EditablePattern | null>(null)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<GalleryPattern | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleAdminLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthBusy(true)
    try {
      const result = await loginAdmin(loginEmail, loginPassword)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setIsAdmin(true)
      setLoginPassword("")
      setLoginOpen(false)
      toast.success("管理员登录成功")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登录失败")
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleAdminLogout() {
    setAuthBusy(true)
    try {
      await logoutAdmin()
      setIsAdmin(false)
      setEditorOpen(false)
      setTagManagerOpen(false)
      setBatchOpen(false)
      setDeleteTarget(null)
      setEditing(null)
      toast.success("已退出管理员登录")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "退出失败")
    } finally {
      setAuthBusy(false)
    }
  }

  // Keep other devices reasonably fresh without requiring a manual reload.
  // Use a safely caught Server Action instead of router.refresh(), so a transient
  // database error cannot replace the whole gallery with the route error boundary.
  const snapshotRequestInFlight = useRef(false)
  useEffect(() => {
    if (active || editorOpen || tagManagerOpen || batchOpen || deleteTarget) return
    let disposed = false
    const refreshIfVisible = async () => {
      if (document.hidden || snapshotRequestInFlight.current) return
      snapshotRequestInFlight.current = true
      try {
        const snapshot = await getGallerySnapshot()
        if (disposed) return
        setPatterns(snapshot.patterns)
        setCurrentTags(snapshot.tags)
      } catch (error) {
        // Keep the last good snapshot visible; a later poll will retry.
        console.warn("[gallery] Background refresh failed; keeping current data", error)
      } finally {
        snapshotRequestInFlight.current = false
      }
    }
    const timer = window.setInterval(refreshIfVisible, 15_000)
    document.addEventListener("visibilitychange", refreshIfVisible)
    return () => {
      disposed = true
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refreshIfVisible)
    }
  }, [active, editorOpen, tagManagerOpen, batchOpen, deleteTarget])

  // 标签名 -> 颜色 key
  const tagColors = useMemo(() => {
    const m: Record<string, string> = {}
    currentTags.forEach((t) => (m[t.name] = t.color))
    return m
  }, [currentTags])

  // 编辑器用的标签信息
  const tagInfos = useMemo<TagInfo[]>(
    () => currentTags.map((t) => ({ name: t.name, color: t.color as TagInfo["color"] })),
    [currentTags],
  )

  // 数据版本号：服务器返回的 patterns 引用变化时递增，用于触发本地状态重置
  const patternsVersion = useMemo(() => patterns.length + patterns.reduce((acc, p) => acc + p.id, 0), [patterns])

  // 当服务端数据更新（新增/删除/编辑）时，重置所有筛选，避免旧状态掩盖新数据
  // 跳过首次挂载（保留用户的初始筛选状态）
  const isFirstMount = useRef(true)
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    setStudio("all")
    setCategories([])
    setQuery("")
  }, [patternsVersion])

  const toggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }

  const toggleFavorite = (id: number) => {
    setFavoriteIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 动态工作室列表（按出现顺序）
  const studios = useMemo(() => {
    const seen: string[] = []
    for (const p of patterns) if (!seen.includes(p.studio)) seen.push(p.studio)
    return seen
  }, [patterns])

  // 编辑器可选工作室：默认 + 已有
  const editorStudios = useMemo(() => {
    const set = new Set<string>(DEFAULT_STUDIOS)
    patterns.forEach((p) => set.add(p.studio))
    return Array.from(set)
  }, [patterns])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return patterns.filter((p) => {
      if (studio === "favorites" && !favoriteIds.has(p.id)) return false
      if (studio !== "all" && studio !== "favorites" && p.studio !== studio) return false
      if (
        categories.length > 0 &&
        !categories.some((c) => p.categories.includes(c))
      )
        return false
      if (q) {
        const haystack = [p.name, p.studio, ...p.categories, p.note ?? ""]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [patterns, studio, categories, query, favoriteIds])

  const studioCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: patterns.length,
      favorites: patterns.filter((p) => favoriteIds.has(p.id)).length,
    }
    for (const s of studios) counts[s] = patterns.filter((p) => p.studio === s).length
    return counts
  }, [patterns, studios, favoriteIds])

  const hasActiveFilters =
    studio !== "all" || categories.length > 0 || query.trim() !== ""

  const clearAll = () => {
    setStudio("all")
    setCategories([])
    setQuery("")
  }

  function openCreate() {
    setEditing(null)
    setEditorOpen(true)
  }

  function openEdit(p: GalleryPattern) {
    setEditing({
      id: p.id,
      name: p.name,
      studio: p.studio,
      categories: p.categories,
      images: p.imageUrls,
      fileUrl: p.fileUrl,
      fileName: p.fileName,
      cloudDriveUrl: p.cloudDriveUrl,
      note: p.note,
    })
    setEditorOpen(true)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleting(true)
    // 乐观更新：立即从 UI 移除，用户无感
    setPatterns((prev) => prev.filter((p) => p.id !== target.id))
    setDeleteTarget(null)
    toast.success("已删除")
    setDeleting(false)

    // 后台异步删除（OSS 资源清理 + DB）。失败再回滚并提示。
    deletePattern(target.id).catch((e) => {
      // 失败时把条目加回去
      setPatterns((prev) => [target, ...prev])
      toast.error(e instanceof Error ? e.message : "删除失败")
    })
  }

  // 编辑器保存：本地立即更新或插入条目，后台 fire-and-forget 同步
  async function handleSaved(pattern: EditablePattern | null, input: Parameters<typeof createPattern>[0]) {
    const isNew = !pattern
    const tempId = isNew ? -Date.now() : 0

    if (pattern) {
      // 更新：直接替换本地条目
      const optimistic: GalleryPattern = {
        id: pattern.id,
        name: input.name,
        studio: input.studio,
        categories: input.categories ?? [],
        imageUrls: input.images,
        thumbnailUrl: input.images[0] ?? "",
        fileUrl: input.fileUrl ?? null,
        fileName: input.fileName ?? null,
        cloudDriveUrl: input.cloudDriveUrl ?? null,
        note: input.note ?? null,
      }
      setPatterns((prev) => prev.map((p) => (p.id === pattern.id ? optimistic : p)))
    } else {
      // 新增：插到列表头（占位 id = -now，等服务端返回真实 id 后替换）
      const optimistic: GalleryPattern = {
        id: tempId,
        name: input.name,
        studio: input.studio,
        categories: input.categories ?? [],
        imageUrls: input.images,
        thumbnailUrl: input.images[0] ?? "",
        fileUrl: input.fileUrl ?? null,
        fileName: input.fileName ?? null,
        cloudDriveUrl: input.cloudDriveUrl ?? null,
        note: input.note ?? null,
      }
      setPatterns((prev) => [optimistic, ...prev])
    }

    // 同步到服务器，服务端返回真实 id 和签名 URL
    const action = pattern
      ? updatePattern(pattern.id, input)
      : createPattern(input)

    if (isNew) {
      // 替换乐观占位条目为服务端返回的真实数据（避免图片重新加载）
      ;(async () => {
        try {
          const result = await action
          if (!result || typeof result !== "object" || !("id" in result)) return
          const { id: newId, imageUrls, thumbnailUrl, fileUrl } = result
          if (!newId) return
          setPatterns((prev) =>
            prev.map((p) =>
              p.id === tempId
                ? {
                    ...p,
                    id: newId,
                    imageUrls: imageUrls ?? p.imageUrls,
                    thumbnailUrl: thumbnailUrl ?? p.thumbnailUrl,
                    fileUrl: fileUrl ?? p.fileUrl,
                  }
                : p,
            ),
          )
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "保存失败")
        }
      })()
    } else {
      action.catch((e) => {
        toast.error(e instanceof Error ? e.message : "保存失败")
      })
    }
  }

  // 批量上传完成后先等数据库确认，再把已保存的记录加入列表。
  async function handleBatchSaved(items: BatchUploadItem[]) {
    const ids = await createPatternsBatch(items)
    if (ids.length !== items.length) {
      throw new Error(`批量保存不完整：${items.length} 条中仅确认 ${ids.length} 条`)
    }
    const saved: GalleryPattern[] = items.map((it, idx) => ({
      id: ids[idx]!,
      name: it.name,
      studio: it.studio,
      categories: it.categories ?? [],
      imageUrls: it.images,
      thumbnailUrl: it.images[0] ?? "",
      fileUrl: it.fileUrl ?? null,
      fileName: it.fileName ?? null,
      cloudDriveUrl: it.cloudDriveUrl ?? null,
      note: it.note ?? null,
    }))
    setPatterns((prev) => [...saved, ...prev])
  }

  const studioItems: { key: string; label: string }[] = [
    { key: "favorites", label: "我的收藏" },
    { key: "all", label: "全部纸样" },
    ...studios.map((s) => ({ key: s, label: s })),
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 py-2 sm:px-6 md:py-3">
          {/* 移动端：第一行 = logo + 搜索；第二行 = 按钮。PC：同一行 */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            {/* 移动端第一行：logo + 搜索框同行。PC：只显示 logo。 */}
            <div className="flex items-center gap-2 md:contents">
              <div className="flex shrink-0 items-center gap-2">
                <Ruler className="size-5 text-primary" aria-hidden="true" />
                <span className="font-serif text-xl font-semibold tracking-tight text-foreground">
                  纸样库
                </span>
              </div>

              <div className="relative min-w-0 flex-1 md:max-w-xl">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索工作室 / 品类 / 款式 / 尺码…"
                  aria-label="全局搜索纸样"
                  className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="清除搜索"
                    className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {isAdmin ? (
                <>
                  <Button variant="outline" size="default" onClick={() => setTagManagerOpen(true)}>
                    <Tags className="mr-1.5 size-4" />
                    标签管理
                  </Button>
                  <Button variant="outline" size="default" onClick={() => setBatchOpen(true)}>
                    <Upload className="mr-1.5 size-4" />
                    批量上传
                  </Button>
                  <Button size="default" onClick={openCreate}>
                    <Plus className="mr-1.5 size-4" />
                    新增纸样
                  </Button>
                  <Link href="/table" className={cn(buttonVariants({ variant: "outline" }), "hidden md:inline-flex")}>
                    <Table2 className="mr-1.5 size-4" />
                    在线表格
                  </Link>
                  <Button variant="outline" size="default" onClick={handleAdminLogout} disabled={authBusy}>
                    <LogOut className="mr-1.5 size-4" />
                    退出管理
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="default" onClick={() => setLoginOpen(true)}>
                  <LogIn className="mr-1.5 size-4" />
                  管理员登录
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] flex-col md:flex-row">
        {/* 左侧工作室导航 —— PC 端固定 */}
        <aside className="shrink-0 border-b border-border px-4 py-4 md:sticky md:top-[85px] md:h-[calc(100vh-85px)] md:w-56 md:self-start md:overflow-y-auto md:border-b-0 md:border-r md:px-5 md:py-6">
          <nav className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
            {studioItems.map((item) => {
              const isActive = studio === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStudio(item.key)}
                  aria-pressed={isActive}
                  className={cn(
                    "flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors md:w-full",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {item.key === "favorites" && <Heart className="size-3.5" />}
                    {item.label}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {studioCounts[item.key] ?? 0}
                  </span>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* 主内容 */}
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">
          {/* 品类标签筛选栏 */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {currentTags.map((tag) => {
              const selected = categories.includes(tag.name)
              const c = tagColorClasses(tag.color)
              return (
                <button
                  key={tag.name}
                  type="button"
                  onClick={() => toggleCategory(tag.name)}
                  aria-pressed={selected}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-medium transition-all",
                    selected
                      ? cn(c.bg, c.text, "border-transparent ring-1 ring-inset ring-black/5")
                      : "border-border bg-card text-muted-foreground hover:border-ring hover:text-foreground",
                  )}
                >

                  {tag.name}
                </button>
              )
            })}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAll}
                className="ml-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                <X className="size-3" />
                清除筛选
              </button>
            )}
          </div>

          <p className="mb-4 text-sm text-muted-foreground">
            {studio === "favorites" && (
              <span className="mr-2 font-serif text-lg font-medium text-foreground">
                我的收藏
              </span>
            )}
            共{" "}
            <span className="font-medium text-foreground">{filtered.length}</span>{" "}
            款纸样
          </p>

          {/* 瀑布流 */}
          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((pattern, index) => (
                <PatternCard
                  key={pattern.id}
                  pattern={pattern}
                  tagColors={tagColors}
                  priority={index === 0}
                  favorite={favoriteIds.has(pattern.id)}
                  onToggleFavorite={toggleFavorite}
                  onOpen={setActive}
                  onEdit={isAdmin ? openEdit : undefined}
                  onDelete={isAdmin ? setDeleteTarget : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
              <p className="text-sm font-medium text-foreground">
                {studio === "favorites" && favoriteIds.size === 0
                  ? "你还没有收藏纸样"
                  : patterns.length === 0
                    ? "还没有纸样"
                    : "未找到匹配的纸样"}
              </p>
              <p className="text-xs text-muted-foreground">
                {studio === "favorites" && favoriteIds.size === 0
                  ? "点击纸样卡片上的心形图标，即可添加到我的收藏"
                  : patterns.length === 0
                  ? "点击右上角「新增纸样」上传第一个纸样"
                  : "尝试调整工作室、品类或搜索关键词"}
              </p>
              {patterns.length === 0 && isAdmin ? (
                <Button className="mt-2" size="sm" onClick={openCreate}>
                  <Plus className="mr-1.5 size-4" />
                  新增纸样
                </Button>
              ) : (
                hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    清除全部筛选
                  </button>
                )
              )}
            </div>
          )}
        </main>
      </div>

      <PatternModal
        pattern={active}
        tagColors={tagColors}
        onClose={() => setActive(null)}
        onDownload={downloadPattern}
        onEdit={isAdmin ? (pattern) => {
          setActive(null)
          openEdit(pattern)
        } : undefined}
        onDelete={isAdmin ? (pattern) => {
          setActive(null)
          setDeleteTarget(pattern)
        } : undefined}
      />

      {isAdmin && editorOpen && (
        <PatternEditor
          key={editing?.id ?? "new"}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          pattern={editing}
          studios={editorStudios}
          tags={tagInfos}
          onSaved={(input) => handleSaved(editing, input)}
        />
      )}

      {isAdmin && (
        <TagManager
          open={tagManagerOpen}
          onOpenChange={setTagManagerOpen}
          tags={currentTags}
        />
      )}

      {isAdmin && (
        <BatchUpload
          open={batchOpen}
          onOpenChange={setBatchOpen}
          onDone={handleBatchSaved}
        />
      )}

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">管理员登录</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdminLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-email">管理员邮箱</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-password">管理员密码</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={authBusy}>
              {authBusy ? "登录中…" : "登录"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAdmin && !!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">删除纸样</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定要删除「{deleteTarget?.name}」吗？此操作不可撤销，图片与电子文件也会一并删除。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
