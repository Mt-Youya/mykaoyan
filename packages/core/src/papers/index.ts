import { z } from "zod"

const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,119}$/)
  .refine((value) => !/(?:^|-)(?:answer|answers)(?:-|$)/i.test(value))
const text = z.string().trim().min(1).max(200)

/** 题型词表，与站内展示和真题训练口径一致。 */
export const PAPER_QUESTION_TYPES = ["单选", "多选", "填空", "判断", "简答", "计算", "算法", "综合"] as const

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
