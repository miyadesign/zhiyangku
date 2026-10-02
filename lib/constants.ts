/** 默认工作室（后台可自由新增其它名称） */
export const DEFAULT_STUDIOS = ["小琴纸样", "卫兰纸样", "其他工作室"]

export type TagColor =
  | "rose"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "fuchsia"
  | "pink"
  | "slate"
  | "stone"
  | "zinc"

/**
 * 标签颜色 -> 浅底/深字/圆点 class。
 * 使用完整静态 class 字符串，确保 Tailwind 能正确编译。
 * 共 20 个颜色供选择。
 */
export const TAG_COLORS: Record<
  TagColor,
  { bg: string; text: string; dot: string; label: string }
> = {
  rose: { bg: "bg-rose-100", text: "text-rose-700", dot: "bg-rose-500", label: "玫红" },
  red: { bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500", label: "红色" },
  orange: { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500", label: "橙色" },
  amber: { bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-500", label: "琥珀" },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-800", dot: "bg-yellow-500", label: "黄色" },
  lime: { bg: "bg-lime-100", text: "text-lime-700", dot: "bg-lime-500", label: "青柠" },
  green: { bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500", label: "绿色" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", label: "翠绿" },
  teal: { bg: "bg-teal-100", text: "text-teal-700", dot: "bg-teal-500", label: "青色" },
  cyan: { bg: "bg-cyan-100", text: "text-cyan-700", dot: "bg-cyan-500", label: "蓝绿" },
  sky: { bg: "bg-sky-100", text: "text-sky-700", dot: "bg-sky-500", label: "天蓝" },
  blue: { bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500", label: "蓝色" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-700", dot: "bg-indigo-500", label: "靛蓝" },
  violet: { bg: "bg-violet-100", text: "text-violet-700", dot: "bg-violet-500", label: "紫罗兰" },
  purple: { bg: "bg-purple-100", text: "text-purple-700", dot: "bg-purple-500", label: "紫色" },
  fuchsia: { bg: "bg-fuchsia-100", text: "text-fuchsia-700", dot: "bg-fuchsia-500", label: "品红" },
  pink: { bg: "bg-pink-100", text: "text-pink-700", dot: "bg-pink-500", label: "粉色" },
  slate: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-500", label: "石板灰" },
  stone: { bg: "bg-stone-100", text: "text-stone-700", dot: "bg-stone-500", label: "灰褐" },
  zinc: { bg: "bg-zinc-100", text: "text-zinc-700", dot: "bg-zinc-500", label: "锌灰" },
}

export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS) as TagColor[]

export const FALLBACK_TAG_COLOR: TagColor = "slate"

/** 前台使用的标签信息（名称 + 颜色） */
export type TagInfo = { name: string; color: TagColor }

const NEUTRAL = TAG_COLORS[FALLBACK_TAG_COLOR]

/** 根据颜色 key 返回样式，非法值回退到中性色 */
export function tagColorClasses(color: string | undefined | null) {
  if (color && color in TAG_COLORS) return TAG_COLORS[color as TagColor]
  return NEUTRAL
}
