import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createVocabCard, parseLocalDate } from "@mykaoyan/core"
import type { VocabData } from "@mykaoyan/core"
import { describe, expect, it } from "vitest"
import { mergeVocabEntries, parsePastedVocab, parseVocabText, summarizeBackup } from "./model"

const folder = fileURLToPath(new URL(".", import.meta.url))

function sources(directory: string) {
  return readdirSync(directory)
    .filter((file) => (file.endsWith(".ts") || file.endsWith(".tsx")) && !file.includes(".test."))
    .map((file) => readFileSync(join(directory, file), "utf8"))
    .join("\n")
}

describe("词表粘贴导入", () => {
  it("解析 Tab 分隔的自有词表，且不重复导入同一词条", () => {
    const incoming = parsePastedVocab("abandon\t放弃\nreview\t复习", () => "id")
    expect(incoming.map(({ term, meaning }) => [term, meaning])).toEqual([
      ["abandon", "放弃"],
      ["review", "复习"],
    ])
    expect(mergeVocabEntries(incoming, incoming).added).toBe(0)
  })

  it("拒绝没有释义或重复的行", () => {
    expect(() => parsePastedVocab("abandon", () => "id")).toThrow("Tab")
    expect(() => parsePastedVocab("abandon\t放弃\nabandon\t放弃", () => "id")).toThrow("重复")
  })

  it("解析 CSV 词表，支持双引号包裹的释义", () => {
    const incoming = parseVocabText('abandon,"放弃, 抛弃"\nreview,复习', () => "id")
    expect(incoming.map(({ term, meaning }) => [term, meaning])).toEqual([
      ["abandon", "放弃, 抛弃"],
      ["review", "复习"],
    ])
  })

  it("解析 JSON 对象数组与 term 到 meaning 的对象", () => {
    expect(
      parseVocabText('[{"term":"abandon","meaning":"放弃"},{"term":"review","meaning":"复习"}]', () => "id")
    ).toHaveLength(2)
    expect(parseVocabText('{"abandon":"放弃","review":"复习"}', () => "id").map(({ term }) => term)).toEqual([
      "abandon",
      "review",
    ])
  })

  it("JSON 词表格式不对时报错", () => {
    expect(() => parseVocabText('[{"term":"abandon"}]', () => "id")).toThrow("meaning")
    expect(() => parseVocabText("[]", () => "id")).toThrow("不能为空")
  })

  it("重复导入只追加新词条，已有的单词卡与复习记录不变", () => {
    const existing: VocabData = {
      entries: [{ id: "one", term: "one", meaning: "一" }],
      cards: [createVocabCard("one", parseLocalDate("2026-10-22"))],
      reviewLogs: [{ date: parseLocalDate("2026-10-22"), reviews: 1, newCards: 1 }],
    }
    const merged = mergeVocabEntries(existing.entries, [
      { id: "one-copy", term: "one", meaning: "一" },
      { id: "two", term: "two", meaning: "二" },
    ])
    const next = { ...existing, entries: merged.entries }
    expect(merged.added).toBe(1)
    expect(next.entries).toHaveLength(2)
    expect(next.cards).toEqual(existing.cards)
    expect(next.reviewLogs).toEqual(existing.reviewLogs)
  })
})

describe("备份摘要", () => {
  it("列出词条、单词卡与复习记录数量", () => {
    const data: VocabData = {
      entries: [
        { id: "one", term: "one", meaning: "一" },
        { id: "two", term: "two", meaning: "二" },
      ],
      cards: [createVocabCard("one", parseLocalDate("2026-10-22"))],
      reviewLogs: [{ date: parseLocalDate("2026-10-22"), reviews: 3, newCards: 1 }],
    }
    expect(summarizeBackup(data)).toEqual({ entries: 2, cards: 1, reviewDays: 1 })
  })
})

describe("私有内容不上传", () => {
  it("复习与备份相关源码不包含任何网络请求", () => {
    const feature = sources(folder)
    const core = sources(fileURLToPath(new URL("../../../../../packages/core/src/vocab", import.meta.url)))
    for (const source of [feature, core]) {
      expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|new WebSocket|axios/)
    }
  })
})
