import { describe, expect, it } from "vitest"

import { blockedComment, normalizeKeywords } from "./index"
describe("评论关键词", () => {
  it("规范化去重，按字面匹配，不把关键词当正则", () => {
    expect(normalizeKeywords([" 虚构禁词 ", "虚构禁词", "ＴＥＳＴ", "[abc]"])).toEqual(["虚构禁词", "test", "[abc]"])
    expect(blockedComment("含有虚构禁词的示例", ["虚构禁词"])).toBe(true)
    expect(blockedComment("TeSt", ["ＴＥＳＴ"])).toBe(true)
    expect(blockedComment("a", ["[abc]"])).toBe(false)
    expect(blockedComment("正常讨论", [])).toBe(false)
  })
})
