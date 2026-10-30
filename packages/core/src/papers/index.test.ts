import { describe, expect, it } from "vitest"

import { publishPaperSchema } from "."

const question = {
  number: 1,
  type: "单选",
  score: 2,
  topics: ["线性表"],
  stemMarkdown: "虚构题面，不包含答案。",
  options: [
    { label: "A", markdown: "选项 A" },
    { label: "B", markdown: "选项 B" },
  ],
  answerMarkdown: "答案 A。",
  analysisMarkdown: "虚构解析。",
}
const paper = {
  subjectCode: "408",
  year: 2024,
  slug: "fictional-paper",
  title: "虚构试卷",
  sourceNote: "虚构来源",
  position: 1,
  questions: [question],
}

describe("发布试卷的公开输入", () => {
  it("接受题面、选项、答案与解析，不允许发布时写上架状态或版本", () => {
    expect(publishPaperSchema.safeParse(paper).success).toBe(true)
    expect(publishPaperSchema.safeParse({ ...paper, listed: true }).success).toBe(false)
    expect(publishPaperSchema.safeParse({ ...paper, contentVersion: 1 }).success).toBe(false)
  })
  it("拒绝答案类标识、非法年份、空答案与非法选项标签", () => {
    expect(publishPaperSchema.safeParse({ ...paper, slug: "fictional-answer" }).success).toBe(false)
    expect(publishPaperSchema.safeParse({ ...paper, year: 1999 }).success).toBe(false)
    expect(publishPaperSchema.safeParse({ ...paper, questions: [{ ...question, answerMarkdown: "" }] }).success).toBe(
      false,
    )
    expect(
      publishPaperSchema.safeParse({
        ...paper,
        questions: [{ ...question, options: [{ label: "I", markdown: "选项" }] }],
      }).success,
    ).toBe(false)
  })
  it("拒绝未知题型、超长题面与空题目数组", () => {
    expect(publishPaperSchema.safeParse({ ...paper, questions: [{ ...question, type: "连线" }] }).success).toBe(false)
    expect(
      publishPaperSchema.safeParse({ ...paper, questions: [{ ...question, stemMarkdown: "x".repeat(50_001) }] })
        .success,
    ).toBe(false)
    expect(publishPaperSchema.safeParse({ ...paper, questions: [] }).success).toBe(false)
  })
})
