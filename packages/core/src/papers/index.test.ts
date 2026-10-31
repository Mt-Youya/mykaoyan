import { describe, expect, it } from "vitest"

import {
  PAPER_MAX_QUESTIONS,
  PAPER_SUBMISSION_MAX_BYTES,
  paperReviewResultSchema,
  paperReviewSchema,
  publishPaperSchema,
  submitPaperSchema,
} from "."

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

const questionsWithNumbers = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ ...question, number: index + 1 }))

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

describe("用户试卷提交契约", () => {
  const submitted = {
    subjectCode: "408",
    year: 2024,
    title: "虚构用户试卷",
    sourceNote: "本人原创的虚构内容",
    rightsConfirmed: true,
    questions: [question],
  }

  it("接受用户试卷，拒绝客户端指定 slug、position、listed 与审核字段", () => {
    expect(submitPaperSchema.safeParse(submitted).success).toBe(true)
    for (const change of [
      { slug: "fictional-paper" },
      { position: 0 },
      { listed: true },
      { origin: "user" },
      { reviewStatus: "approved" },
    ])
      expect(submitPaperSchema.safeParse({ ...submitted, ...change }).success).toBe(false)
  })
  it("限制年份、科目、标题、来源说明与权利声明", () => {
    for (const change of [
      { year: 1999 },
      { year: 2101 },
      { subjectCode: "40" },
      { title: "" },
      { title: "虚".repeat(201) },
      { sourceNote: "" },
      { sourceNote: "虚".repeat(501) },
      { rightsConfirmed: false },
      { rightsConfirmed: "true" },
    ])
      expect(submitPaperSchema.safeParse({ ...submitted, ...change }).success).toBe(false)
    const { rightsConfirmed, ...missing } = submitted
    expect(rightsConfirmed).toBe(true)
    expect(submitPaperSchema.safeParse(missing).success).toBe(false)
  })
  it("题数限制为 1–50", () => {
    expect(PAPER_MAX_QUESTIONS).toBe(50)
    expect(submitPaperSchema.safeParse({ ...submitted, questions: [] }).success).toBe(false)
    expect(submitPaperSchema.safeParse({ ...submitted, questions: questionsWithNumbers(51) }).success).toBe(false)
    expect(submitPaperSchema.safeParse({ ...submitted, questions: questionsWithNumbers(50) }).success).toBe(true)
  })
  it("题号唯一且严格升序", () => {
    expect(
      submitPaperSchema.safeParse({ ...submitted, questions: [question, { ...question, number: 1 }] }).success,
    ).toBe(false)
    expect(
      submitPaperSchema.safeParse({
        ...submitted,
        questions: [
          { ...question, number: 2 },
          { ...question, number: 1 },
        ],
      }).success,
    ).toBe(false)
    expect(
      submitPaperSchema.safeParse({
        ...submitted,
        questions: [
          { ...question, number: 1 },
          { ...question, number: 3 },
        ],
      }).success,
    ).toBe(true)
  })
  it("选择题必须带选项，非选择题不得带选项", () => {
    expect(submitPaperSchema.safeParse({ ...submitted, questions: [{ ...question, options: null }] }).success).toBe(
      false,
    )
    expect(
      submitPaperSchema.safeParse({ ...submitted, questions: [{ ...question, type: "判断", options: null }] }).success,
    ).toBe(true)
    expect(
      submitPaperSchema.safeParse({
        ...submitted,
        questions: [{ ...question, type: "判断", options: question.options }],
      }).success,
    ).toBe(false)
  })
  it("整卷题面+答案+解析的 UTF-8 字节数不超过 512 KiB", () => {
    expect(PAPER_SUBMISSION_MAX_BYTES).toBe(524_288)
    const oversized = Array.from({ length: 11 }, (_, index) => ({
      number: index + 1,
      type: "填空",
      score: null,
      topics: [],
      stemMarkdown: "x".repeat(50_000),
      options: null,
      answerMarkdown: "虚构答案",
      analysisMarkdown: null,
    }))
    expect(submitPaperSchema.safeParse({ ...submitted, questions: oversized }).success).toBe(false)
  })
})

describe("用户试卷审核契约", () => {
  it("通过，或驳回并填写 1–500 字原因", () => {
    expect(paperReviewSchema.safeParse({ decision: "approve" }).success).toBe(true)
    expect(paperReviewSchema.safeParse({ decision: "reject", reason: "虚构驳回原因" }).success).toBe(true)
    for (const change of [
      { decision: "reject" },
      { decision: "reject", reason: "" },
      { decision: "reject", reason: "虚".repeat(501) },
      { decision: "approve", reason: "多余原因" },
      { decision: "publish" },
    ])
      expect(paperReviewSchema.safeParse(change).success).toBe(false)
  })
  it("审核结果包含状态、上架状态与带时区的时间", () => {
    const result = {
      slug: "u-0123456789ab",
      reviewStatus: "rejected",
      listed: false,
      reviewedAt: "2026-10-31T10:00:00+08:00",
      reviewReason: "虚构驳回原因",
    }
    expect(paperReviewResultSchema.safeParse(result).success).toBe(true)
    expect(paperReviewResultSchema.safeParse({ ...result, reviewStatus: "approved", reviewReason: null }).success).toBe(
      true,
    )
    expect(paperReviewResultSchema.safeParse({ ...result, reviewStatus: "draft" }).success).toBe(false)
    expect(paperReviewResultSchema.safeParse({ ...result, reviewedAt: "2026-10-31" }).success).toBe(false)
  })
})
