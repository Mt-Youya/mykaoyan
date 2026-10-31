import { z } from "zod"

import { utf8ByteLength } from "../bytes"

const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,119}$/)
  .refine((value) => !/(?:^|-)(?:answer|answers)(?:-|$)/i.test(value))
const text = z.string().trim().min(1).max(200)

/** 题型词表，与站内展示和真题训练口径一致。 */
export const PAPER_QUESTION_TYPES = ["单选", "多选", "填空", "判断", "简答", "计算", "算法", "综合"] as const

/** 试卷来源：站主取得授权后发布的真题（admin）与用户投稿（user）。 */
export const PAPER_ORIGINS = ["admin", "user"] as const
/** 审核状态；管理员发布真题的路径直接写 approved，用户试卷先审后发。 */
export const PAPER_REVIEW_STATUSES = ["pending", "approved", "rejected"] as const
/** 用户试卷题数上限与整卷题面+答案+解析的 UTF-8 字节上限。 */
export const PAPER_MAX_QUESTIONS = 50
export const PAPER_SUBMISSION_MAX_BYTES = 512 * 1024

/** 选择题选项；label 只允许 A–H。 */
export const paperQuestionOptionSchema = z.strictObject({
  label: z.string().regex(/^[A-H]$/),
  markdown: z.string().min(1).max(10_000),
})

/** 一道题：题面公开，答案与解析只经登录后的答案接口读取。 */
export const paperQuestionSchema = z.strictObject({
  number: z.number().int().min(1).max(999),
  type: z.enum(PAPER_QUESTION_TYPES),
  score: z.number().int().min(0).max(100).nullable(),
  topics: z.array(z.string().trim().min(1).max(50)).max(20),
  stemMarkdown: z.string().min(1).max(50_000),
  options: z.array(paperQuestionOptionSchema).min(2).max(8).nullable(),
  answerMarkdown: z.string().min(1).max(50_000),
  analysisMarkdown: z.string().max(50_000).nullable(),
})
export type PaperQuestion = z.infer<typeof paperQuestionSchema>

/** 试卷发布输入：整卷元数据与逐题结构化内容；不包含上架状态。 */
export const publishPaperSchema = z.strictObject({
  subjectCode: z
    .string()
    .regex(/^\d{3}$/)
    .describe("三位考试科目代码，例如 302、408。"),
  year: z.number().int().min(2000).max(2100),
  slug,
  title: text,
  sourceNote: z.string().trim().max(500).nullable().describe("来源说明，不得包含题目原文或答案。"),
  position: z.number().int().nonnegative().max(2147483647),
  questions: z.array(paperQuestionSchema).min(1).max(100),
})
export type PublishPaper = z.infer<typeof publishPaperSchema>

/** 试卷发布结果；内容哈希用于判断变化，版本号由服务端递增。 */
export const publishPaperResultSchema = z.strictObject({
  slug: z.string(),
  unchanged: z.boolean(),
  version: z.number().int(),
  listed: z.boolean(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  questionCount: z.number().int().min(0),
})

const CHOICE_QUESTION_TYPES = new Set(["单选", "多选"])

/** 整卷题面（含选择题选项）+答案+解析的 UTF-8 字节数。 */
function paperBytes(questions: readonly PaperQuestion[]): number {
  return questions.reduce(
    (sum, question) =>
      sum +
      utf8ByteLength(question.stemMarkdown) +
      utf8ByteLength(question.answerMarkdown) +
      (question.analysisMarkdown === null ? 0 : utf8ByteLength(question.analysisMarkdown)) +
      (question.options ?? []).reduce((optionSum, option) => optionSum + utf8ByteLength(option.markdown), 0),
    0,
  )
}

/** 用户试卷提交输入：`slug`、`position`、`listed` 由服务端生成，客户端不能指定。 */
export const submitPaperSchema = z
  .strictObject({
    subjectCode: z
      .string()
      .regex(/^\d{3}$/)
      .describe("三位考试科目代码，例如 302、408。"),
    year: z.number().int().min(2000).max(2100),
    title: text,
    sourceNote: z.string().trim().min(1).max(500).describe("来源与权利说明，不得包含题目原文或答案。"),
    rightsConfirmed: z.literal(true),
    questions: z.array(paperQuestionSchema).min(1).max(PAPER_MAX_QUESTIONS),
  })
  .superRefine((value, ctx) => {
    let previous = 0
    for (const [index, question] of value.questions.entries()) {
      if (question.number <= previous)
        ctx.addIssue({ code: "custom", message: "题号必须唯一且严格升序", path: ["questions", index, "number"] })
      previous = question.number
      const choice = CHOICE_QUESTION_TYPES.has(question.type)
      if (choice && question.options === null)
        ctx.addIssue({ code: "custom", message: "选择题必须带 2–8 个选项", path: ["questions", index, "options"] })
      if (!choice && question.options !== null)
        ctx.addIssue({ code: "custom", message: "非选择题不得带选项", path: ["questions", index, "options"] })
    }
    if (paperBytes(value.questions) > PAPER_SUBMISSION_MAX_BYTES)
      ctx.addIssue({
        code: "custom",
        message: `整卷题面、答案与解析合计不能超过 ${PAPER_SUBMISSION_MAX_BYTES} 字节`,
        path: ["questions"],
      })
  })
export type SubmitPaper = z.infer<typeof submitPaperSchema>

/** 管理员审核用户试卷：通过，或驳回并填写 1–500 字原因。 */
export const paperReviewSchema = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("approve") }),
  z.strictObject({ decision: z.literal("reject"), reason: z.string().trim().min(1).max(500) }),
])
export type PaperReview = z.infer<typeof paperReviewSchema>

/** 审核结果：审核后的状态、上架状态与审核时间；驳回原因仅驳回时有值。 */
export const paperReviewResultSchema = z.strictObject({
  slug: z.string(),
  reviewStatus: z.enum(PAPER_REVIEW_STATUSES),
  listed: z.boolean(),
  reviewedAt: z.iso.datetime({ offset: true }).describe("本次审核时间，带时区。"),
  reviewReason: z.string().nullable().describe("驳回原因；通过时为 null。"),
})
export type PaperReviewResult = z.infer<typeof paperReviewResultSchema>
