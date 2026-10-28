import { z } from "zod"
import { PROGRESS_FILE_APP, PROGRESS_FILE_VERSION, progressDataSchema } from "./schema"

const nonNegativeInteger = z.number().int().nonnegative()

/** 一类记录的新增、修改、删除条数；类别与进度文件 data 的分组同名。 */
function countByCategory(description: string) {
  return z
    .strictObject({
      profile: nonNegativeInteger.describe("备考档案的条数。"),
      progress: nonNegativeInteger.describe("考点进度的条数。"),
      mistakes: nonNegativeInteger.describe("错题的条数。"),
      daily: nonNegativeInteger.describe("每日记录的条数。"),
      dayPlans: nonNegativeInteger.describe("按天计划的条数。"),
      weekly: nonNegativeInteger.describe("周复盘的条数。"),
    })
    .describe(description)
}

/** 进度文件 PUT 成功后的变更摘要；完整文件用 GET 读取。 */
export const progressChangeSummarySchema = z
  .strictObject({
    app: z.literal(PROGRESS_FILE_APP).describe("固定为 mykaoyan，用于识别本站响应。"),
    version: z.literal(PROGRESS_FILE_VERSION).describe("进度文件格式版本，目前为 1。"),
    etag: z.string().min(1).describe("替换后的当前 ETag；下次 PUT 的 If-Match 用它。"),
    changes: z
      .strictObject({
        added: countByCategory("新增条数。"),
        updated: countByCategory("修改条数。"),
        removed: countByCategory("删除条数。"),
      })
      .describe("按记录类别统计的新增、修改、删除条数。"),
  })
  .describe("进度文件 PUT 成功后的变更摘要；完整文件用 GET 读取。")

export type ProgressChangeSummary = z.infer<typeof progressChangeSummarySchema>

type ProgressDataInput = z.input<typeof progressDataSchema>
type Category = keyof ProgressDataInput
type ChangeCounts = Record<Category, number>

const categories = [
  "profile",
  "progress",
  "mistakes",
  "daily",
  "dayPlans",
  "weekly",
] as const satisfies readonly Category[]

function emptyCounts(): ChangeCounts {
  return Object.fromEntries(categories.map((category) => [category, 0])) as ChangeCounts
}

function countRecords<T>(before: readonly T[], after: readonly T[], keyOf: (value: T) => string) {
  const beforeByKey = new Map(before.map((value) => [keyOf(value), value]))
  const afterByKey = new Map(after.map((value) => [keyOf(value), value]))
  let added = 0
  let updated = 0
  let removed = 0

  for (const [key, value] of afterByKey) {
    const existing = beforeByKey.get(key)
    if (!existing) added += 1
    else if (JSON.stringify(existing) !== JSON.stringify(value)) updated += 1
  }
  for (const key of beforeByKey.keys()) if (!afterByKey.has(key)) removed += 1
  return { added, updated, removed }
}

/** 由两份完整进度文件的数据部分推算 PUT 返回的新增、修改、删除条数。 */
export function summarizeProgressChanges(before: ProgressDataInput, after: ProgressDataInput) {
  const added = emptyCounts()
  const updated = emptyCounts()
  const removed = emptyCounts()
  const profileChanged = JSON.stringify(before.profile) !== JSON.stringify(after.profile)
  if (before.profile === null && after.profile !== null) added.profile = 1
  else if (before.profile !== null && after.profile === null) removed.profile = 1
  else if (profileChanged) updated.profile = 1

  const lists = {
    progress: countRecords(before.progress, after.progress, (value) => value.topicId),
    mistakes: countRecords(before.mistakes, after.mistakes, (value) => value.id),
    daily: countRecords(before.daily, after.daily, (value) => value.date),
    dayPlans: countRecords(before.dayPlans, after.dayPlans, (value) => value.date),
    weekly: countRecords(before.weekly, after.weekly, (value) => value.weekStart),
  }
  for (const category of Object.keys(lists) as (keyof typeof lists)[]) {
    added[category] = lists[category].added
    updated[category] = lists[category].updated
    removed[category] = lists[category].removed
  }
  return { added, updated, removed }
}
