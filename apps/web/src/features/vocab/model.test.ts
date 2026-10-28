import { describe, expect, it } from "vitest"
import { mergeVocabEntries, parsePastedVocab } from "./model"

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
})
