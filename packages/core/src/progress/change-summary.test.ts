import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  PROGRESS_FILE_APP,
  PROGRESS_FILE_VERSION,
  progressChangeSummarySchema,
  progressDataSchema,
  summarizeProgressChanges,
} from "./index"
import { emptyProgressFileFixture, fullProgressFileFixture } from "./fixtures/index"

const validSummary = {
  app: PROGRESS_FILE_APP,
  version: PROGRESS_FILE_VERSION,
  etag: '"revision-7"',
  changes: {
    added: { profile: 0, progress: 1, mistakes: 2, daily: 1, dayPlans: 0, weekly: 0 },
    updated: { profile: 1, progress: 0, mistakes: 0, daily: 0, dayPlans: 1, weekly: 0 },
    removed: { profile: 0, progress: 0, mistakes: 1, daily: 0, dayPlans: 0, weekly: 0 },
  },
} satisfies z.input<typeof progressChangeSummarySchema>

type MutableSummary = {
  app: string
  version: number
  etag: string
  changes: Record<"added" | "updated" | "removed", Record<string, number>>
}

const clone = (): MutableSummary => JSON.parse(JSON.stringify(validSummary)) as MutableSummary

describe("进度文件变更摘要", () => {
  it("接受完整摘要", () => {
    const result = progressChangeSummarySchema.safeParse(validSummary)
    expect(result.success, result.error?.message).toBe(true)
  })

  it("类别与进度文件 data 的分组一致", () => {
    const counts = progressChangeSummarySchema.shape.changes.shape.added
    expect(Object.keys(counts.shape).toSorted()).toEqual(Object.keys(progressDataSchema.shape).toSorted())
  })

  it("拒绝负条数、小数、空 etag 与未知类别", () => {
    const negative = clone()
    negative.changes.added.mistakes = -1
    expect(progressChangeSummarySchema.safeParse(negative).success).toBe(false)

    const fractional = clone()
    fractional.changes.updated.daily = 0.5
    expect(progressChangeSummarySchema.safeParse(fractional).success).toBe(false)

    const emptyEtag = clone()
    emptyEtag.etag = ""
    expect(progressChangeSummarySchema.safeParse(emptyEtag).success).toBe(false)

    const unknownCategory = clone()
    unknownCategory.changes.removed.words = 1
    expect(progressChangeSummarySchema.safeParse(unknownCategory).success).toBe(false)
  })

  it("拒绝缺少类别、错误识别字段与多余字段", () => {
    const missing = clone()
    delete missing.changes.removed.weekly
    expect(progressChangeSummarySchema.safeParse(missing).success).toBe(false)

    const wrongApp = clone()
    wrongApp.app = "kaoyan"
    expect(progressChangeSummarySchema.safeParse(wrongApp).success).toBe(false)

    const extra = clone()
    extra.changes.added.notes = 0
    expect(progressChangeSummarySchema.safeParse(extra).success).toBe(false)
  })

  it("可以生成 JSON Schema 2020-12", () => {
    const schema = z.toJSONSchema(progressChangeSummarySchema, { io: "input" })
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
    expect(schema.additionalProperties).toBe(false)
  })

  it("按稳定标识统计五类列表记录与备考档案的变化", () => {
    const before = emptyProgressFileFixture.value.data
    const after = fullProgressFileFixture.value.data
    expect(summarizeProgressChanges(before, after)).toEqual({
      added: { profile: 1, progress: 2, mistakes: 1, daily: 1, dayPlans: 1, weekly: 1 },
      updated: { profile: 0, progress: 0, mistakes: 0, daily: 0, dayPlans: 0, weekly: 0 },
      removed: { profile: 0, progress: 0, mistakes: 0, daily: 0, dayPlans: 0, weekly: 0 },
    })
  })
})
