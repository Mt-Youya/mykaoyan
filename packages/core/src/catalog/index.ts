import { z } from "zod"
const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,119}$/)
  .refine((v) => !/(?:^|-)(?:answer|answers)(?:-|$)/i.test(v))
const text = z.string().trim().min(1).max(200)
const asset = z.strictObject({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  md5: z.string().regex(/^[A-Za-z0-9+/]{22}==$/),
  size: z.number().int().min(1).max(5_000_000_000),
})
export const publishLessonSchema = z.strictObject({
  course: z.strictObject({ slug, title: text, subjectCode: z.string().regex(/^\d{3}$/) }),
  chapter: z.strictObject({ slug, title: text, position: z.number().int().nonnegative().max(2147483647) }),
  slug,
  title: text,
  position: z.number().int().nonnegative().max(2147483647),
  scriptMarkdown: z.string().max(500_000),
  video: asset,
  subtitle: asset.nullable(),
})
export type PublishLesson = z.infer<typeof publishLessonSchema>
export const publishPreparedSchema = z.strictObject({
  id: z.string().uuid().nullable(),
  unchanged: z.boolean(),
  contentHash: z.string(),
  uploads: z.array(
    z.strictObject({ kind: z.enum(["video", "subtitle"]), url: z.string(), headers: z.record(z.string(), z.string()) }),
  ),
})
export const publishResultSchema = z.strictObject({
  slug: z.string(),
  contentHash: z.string().nullable(),
  version: z.number().int(),
  listed: z.boolean(),
  keys: z.array(z.string()),
  cleanupPending: z.boolean(),
})
/** 讲义发布输入：Markdown 单独发布，不带上架状态与对象 key。 */
export const publishHandoutSchema = z.strictObject({
  subjectCode: z
    .string()
    .regex(/^\d{3}$/)
    .describe("三位考试科目代码，例如 302、408。"),
  slug,
  title: text,
  position: z.number().int().nonnegative().max(2147483647),
  markdown: z.string().min(1).max(1_000_000).describe("讲义 Markdown；只发布题面或自学材料，不包含答案与解析。"),
})
export type PublishHandout = z.infer<typeof publishHandoutSchema>
/** 讲义发布结果：内容哈希用于客户端判断是否变化，不作为版本号。 */
export const publishHandoutResultSchema = z.strictObject({
  slug: z.string(),
  unchanged: z.boolean(),
  listed: z.boolean(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.iso.datetime({ offset: true }).describe("本次登记后的更新时间，带时区。"),
})
