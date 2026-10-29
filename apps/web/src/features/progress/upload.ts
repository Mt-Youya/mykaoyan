import { progressFileSchema, summarizeProgressChanges } from "@mykaoyan/core"
import type { ProgressChangeSummary, ProgressFile } from "@mykaoyan/core"

export type ParsedUpload = { ok: true; document: ProgressFile } | { ok: false; message: string }

/** 解析考生选中的本地进度文件；JSON 或 schema 不通过时给出可展示的提示。 */
export function parseProgressUpload(text: string): ParsedUpload {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, message: "文件不是合法的 JSON，请选择从本站下载的进度文件。" }
  }
  const parsed = progressFileSchema.safeParse(value)
  if (!parsed.success) return { ok: false, message: "文件不符合进度文件 v1 契约，请重新下载后再试。" }
  return { ok: true, document: parsed.data }
}

export type ProgressCounts = {
  profile: number
  progress: number
  mistakes: number
  daily: number
  dayPlans: number
  weekly: number
}

export function countProgressRecords(document: ProgressFile): ProgressCounts {
  return {
    profile: document.data.profile ? 1 : 0,
    progress: document.data.progress.length,
    mistakes: document.data.mistakes.length,
    daily: document.data.daily.length,
    dayPlans: document.data.dayPlans.length,
    weekly: document.data.weekly.length,
  }
}

/** 与后端 PUT 返回的 changes 同口径，用于上传前给考生预览。 */
export function summarizeUpload(current: ProgressFile, next: ProgressFile): ProgressChangeSummary {
  return {
    app: next.app,
    version: next.version,
    etag: "",
    changes: summarizeProgressChanges(current.data, next.data),
  }
}

const categoryLabels = {
  profile: "备考档案",
  progress: "考点进度",
  mistakes: "错题",
  daily: "每日记录",
  dayPlans: "按天计划",
  weekly: "周复盘",
} as const

export type ChangeRow = {
  category: keyof typeof categoryLabels
  label: string
  added: number
  updated: number
  removed: number
}

/** 只保留有变化的类别，按固定顺序输出，供表格渲染。 */
export function changeRows(summary: ProgressChangeSummary): ChangeRow[] {
  const rows: ChangeRow[] = []
  for (const category of Object.keys(categoryLabels) as (keyof typeof categoryLabels)[]) {
    const added = summary.changes.added[category]
    const updated = summary.changes.updated[category]
    const removed = summary.changes.removed[category]
    if (added + updated + removed > 0) {
      rows.push({ category, label: categoryLabels[category], added, updated, removed })
    }
  }
  return rows
}
