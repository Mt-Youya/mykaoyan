import { describe, expect, it } from "vitest"

import { PROGRESS_FILE_APP, PROGRESS_FILE_VERSION, progressFileSchema } from "@mykaoyan/core"
import type { ProgressFile } from "@mykaoyan/core"

import { changeRows, countProgressRecords, parseProgressUpload, summarizeUpload } from "./upload"

export function emptyProgressFile(revision = 0): ProgressFile {
  return progressFileSchema.parse({
    app: PROGRESS_FILE_APP,
    version: PROGRESS_FILE_VERSION,
    revision,
    updatedAt: "2026-10-29T00:00:00.000Z",
    updatedBy: "api",
    data: { profile: null, progress: [], mistakes: [], daily: [], dayPlans: [], weekly: [] },
  })
}

describe("解析上传的进度文件", () => {
  it("合法 JSON 与 v1 契约通过", () => {
    const result = parseProgressUpload(JSON.stringify(emptyProgressFile(3)))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document.revision).toBe(3)
  })

  it("非法 JSON 给出可展示的提示", () => {
    const result = parseProgressUpload("{not json")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("JSON")
  })

  it("JSON 合法但不符合 v1 契约时拒绝", () => {
    const result = parseProgressUpload(JSON.stringify({ app: "other", version: 1, data: {} }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("v1")
  })
})

describe("记录概览与变更摘要", () => {
  it("空文档的各类记录都是 0，且没有可展示的变更", () => {
    const document = emptyProgressFile()
    expect(countProgressRecords(document)).toEqual({
      profile: 0,
      progress: 0,
      mistakes: 0,
      daily: 0,
      dayPlans: 0,
      weekly: 0,
    })
    expect(changeRows(summarizeUpload(document, document))).toEqual([])
  })

  it("有变化的类别按固定顺序输出，零变化类别不出现", () => {
    const document = emptyProgressFile()
    const summary = summarizeUpload(document, document)
    summary.changes.added.mistakes = 2
    summary.changes.updated.daily = 1
    expect(changeRows(summary)).toEqual([
      { category: "mistakes", label: "错题", added: 2, updated: 0, removed: 0 },
      { category: "daily", label: "每日记录", added: 0, updated: 1, removed: 0 },
    ])
  })
})
