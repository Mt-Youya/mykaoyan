import { z } from "zod"
import { localDateSchema } from "../dates/index"

/** 进度文件识别字段；只接受本站的进度文件，不兼容旧站文件。 */
export const PROGRESS_FILE_APP = "mykaoyan" as const

/** 进度文件格式版本；兼容变更留在 v1，破坏性变更走 v2。 */
export const PROGRESS_FILE_VERSION = 1 as const

const nonNegativeInteger = z.number().int().nonnegative()

/** 非空文本：编号、名称和标题不接受空串或纯空白。 */
const nonBlankText = z.string().regex(/\S/)

/** 带时区的 ISO 时间，例如 2030-01-14T12:00:00.000Z 或 2030-01-14T12:00:00+08:00。 */
export const isoDateTimeSchema = z.iso
  .datetime({ offset: true })
  .describe("带时区的 ISO 时间，例如 2030-01-14T12:00:00.000Z。")

/** 三位考试科目代码，例如 101、302、408。 */
export const subjectCodeSchema = z
  .string()
  .regex(/^\d{3}$/)
  .describe("三位考试科目代码，例如 302、408。")

/** 考试科目代码到分钟数的映射；分钟必须是非负整数。 */
export const minutesBySubjectSchema = z
  .record(subjectCodeSchema, nonNegativeInteger)
  .describe("考试科目代码到分钟数的映射；分钟是非负整数。")

/** 进度文件的写入来源。 */
export const updatedBySchema = z
  .union([z.literal("site"), z.literal("api"), z.templateLiteral(["agent:", z.string().min(1)])])
  .describe("写入来源：site 网页、api 云端接口、agent:<名称> 考生的 agent。")

/** 考点进度中可以手动设置的部分；稳定与待重测由错题推算，不写进文件。 */
export const topicManualStateSchema = z
  .enum(["untested", "learning", "practiced"])
  .describe("未测 untested、学习中 learning、已练 practiced；稳定与待重测由错题推算。")

/** 复测结果；只有独立完成能推进错题走向稳定。 */
export const retestResultSchema = z
  .enum(["independent", "with-hint", "failed"])
  .describe("独立完成 independent、提示后完成 with-hint、不会 failed。")

/** 错因。 */
export const mistakeCauseSchema = z
  .enum(["concept", "condition", "calculation", "evidence", "misread", "strategy"])
  .describe("错因：概念 concept、条件 condition、计算 calculation、依据 evidence、审题 misread、策略 strategy。")

/** 一次原始复测记录；第几次、下次日期与逾期天数由本站推算。 */
export const retestAttemptSchema = z
  .strictObject({
    on: localDateSchema.describe("复测日期。"),
    result: retestResultSchema,
  })
  .describe("一次原始复测记录。")

/** 备考档案中的考试科目。 */
export const profileSubjectSchema = z
  .strictObject({
    code: subjectCodeSchema.describe("考试科目代码。"),
    name: nonBlankText.describe("考试科目名称；统考科目名称固定，自命题科目由考生自己命名。"),
    targetScore: nonNegativeInteger.describe("该科目标分。"),
  })
  .describe("备考档案中的考试科目。")

/** 阶段内某类日期的计划分钟。 */
export const phasePlanSchema = z
  .strictObject({
    minutes: minutesBySubjectSchema.describe("各科计划分钟。"),
    flexMin: nonNegativeInteger.describe("弹性时间分钟，不预先分给任何科目。"),
  })
  .describe("阶段内工作日或周末的计划分钟。")

/** 按日期划分的备考阶段。 */
export const phaseSchema = z
  .strictObject({
    name: nonBlankText.describe("阶段名称。"),
    start: localDateSchema.describe("阶段开始日期，含当天。"),
    end: localDateSchema.describe("阶段结束日期，含当天；不得早于开始日期。"),
    weekday: phasePlanSchema.describe("工作日（周一到周五）的计划分钟。"),
    weekend: phasePlanSchema.describe("周六与周日的计划分钟。"),
  })
  .describe("按日期划分的备考阶段。")

/** 阶段校验：结束不早于开始、按日期先后排列、互不重叠。合法返回 null，否则返回错误说明。 */
export function validatePhases(phases: StudyProfile["phases"]): string | null {
  let previous: StudyProfile["phases"][number] | null = null
  for (const phase of phases) {
    if (phase.end < phase.start) return `阶段「${phase.name}」的结束日期早于开始日期`
    if (previous && phase.start <= previous.end)
      return `阶段「${phase.name}」与「${previous.name}」重叠或未按日期先后排列`
    previous = phase
  }
  return null
}

/** 考生的备考档案。 */
export const studyProfileSchema = z
  .strictObject({
    examDate: localDateSchema.describe("初试日期。"),
    subjects: z.array(profileSubjectSchema).describe("所考的考试科目，顺序即展示顺序。"),
    otherMin: nonNegativeInteger.describe("每天不归入任何考试科目的固定分钟。"),
    phases: z.array(phaseSchema).describe("按日期先后排列、互不重叠的阶段。"),
  })
  .superRefine((profile, context) => {
    const message = validatePhases(profile.phases)
    if (message) context.addIssue({ code: "custom", message, path: ["phases"] })
  })
  .describe("考生的备考档案。")

/** 考点当前的手动进度。 */
export const topicProgressSchema = z
  .strictObject({
    topicId: nonBlankText.describe("考点编号，例如 M03、D02。"),
    manual: topicManualStateSchema,
    updatedAt: isoDateTimeSchema.describe("最后更新时间。"),
  })
  .describe("考点进度，只保存考生手动设置的状态。")

/** 一道错题及其原始复测记录。 */
export const mistakeSchema = z
  .strictObject({
    id: nonBlankText.describe("错题编号。"),
    legacyId: z.string().optional().describe("回填来源中的原编号。"),
    subject: subjectCodeSchema.describe("考试科目代码。"),
    topicId: z.string().optional().describe("显式关联的考点编号。"),
    source: z.string().describe("题目来源；不得复制真题全文。"),
    questionMd: z.string().describe("考生记录的题目，Markdown。"),
    attemptMd: z.string().optional().describe("原始作答，Markdown。"),
    firstWrongStep: z.string().optional().describe("第一个错误步骤。"),
    causes: z.array(mistakeCauseSchema).describe("错因。"),
    correctionMd: z.string().describe("订正，Markdown。"),
    keyCondition: z.string().optional().describe("关键条件。"),
    correctedOn: localDateSchema.describe("订正日期；复测日期由它推算。"),
    retests: z.array(retestAttemptSchema).describe("原始复测记录；推算时按日期先后排序，同一天的多条按记录顺序。"),
    createdAt: isoDateTimeSchema.describe("创建时间。"),
  })
  .describe("一道错题及其原始复测记录；稳定状态由复测记录推算，不写入文件。")

/** 每日记录；每天最多一条。 */
export const dailyLogSchema = z
  .strictObject({
    date: localDateSchema.describe("每日记录日期；可以补录过去的日期。"),
    minutes: minutesBySubjectSchema.describe("当天各科实际学习时长。"),
    done: z.string().describe("完成事项。"),
    tomorrowTop: z.string().describe("明日首要任务。"),
    retro: z.string().describe("一句复盘。"),
  })
  .describe("每日记录。")

/** 按天覆盖的计划分钟。 */
export const dayPlanSchema = z
  .strictObject({
    date: localDateSchema.describe("按天计划日期。"),
    minutes: minutesBySubjectSchema.describe("各科计划分钟。"),
    flexMin: nonNegativeInteger.describe("弹性时间分钟。"),
  })
  .describe("按天覆盖的计划分钟。")

/** 周复盘；只保存考生填写的下周调整。 */
export const weeklyReviewSchema = z
  .strictObject({
    weekStart: localDateSchema.describe("周开始日期，必须是周一。"),
    nextWeekAdjustment: z.string().describe("下周调整。"),
  })
  .describe("周复盘，只保存考生填写的下周调整；其余汇总由本站推算。")

/** 进度文件中的全部学习数据。 */
export const progressDataSchema = z
  .strictObject({
    profile: studyProfileSchema.nullable().describe("备考档案；尚未建立时为 null。"),
    progress: z.array(topicProgressSchema).describe("考点进度。"),
    mistakes: z.array(mistakeSchema).describe("错题。"),
    daily: z.array(dailyLogSchema).describe("每日记录。"),
    dayPlans: z.array(dayPlanSchema).describe("按天计划。"),
    weekly: z.array(weeklyReviewSchema).describe("周复盘。"),
  })
  .describe("备考档案与五类记录；不含私有内容与单词卡。")

/** 进度文件 v1：一个账号的全部学习数据。 */
export const progressFileSchema = z
  .strictObject({
    $schema: z.string().optional().describe("公开的进度文件 JSON Schema 地址。"),
    app: z.literal(PROGRESS_FILE_APP).describe("固定为 mykaoyan，用于识别本站进度文件。"),
    version: z.literal(PROGRESS_FILE_VERSION).describe("进度文件格式版本，目前为 1。"),
    revision: nonNegativeInteger.describe("每次写入加 1，只用于展示；并发以 ETag 为准。"),
    updatedAt: isoDateTimeSchema.describe("最后修改时间。"),
    updatedBy: updatedBySchema,
    data: progressDataSchema,
  })
  .describe("进度文件 v1，包含一个账号的全部学习数据。")

export type IsoDateTime = z.infer<typeof isoDateTimeSchema>
export type SubjectCode = z.infer<typeof subjectCodeSchema>
export type MinutesBySubject = z.infer<typeof minutesBySubjectSchema>
export type UpdatedBy = z.infer<typeof updatedBySchema>
export type TopicManualState = z.infer<typeof topicManualStateSchema>
export type RetestResult = z.infer<typeof retestResultSchema>
export type MistakeCause = z.infer<typeof mistakeCauseSchema>
export type RetestAttempt = z.infer<typeof retestAttemptSchema>
export type ProfileSubject = z.infer<typeof profileSubjectSchema>
export type PhasePlan = z.infer<typeof phasePlanSchema>
export type Phase = z.infer<typeof phaseSchema>
export type StudyProfile = z.infer<typeof studyProfileSchema>
export type TopicProgress = z.infer<typeof topicProgressSchema>
export type Mistake = z.infer<typeof mistakeSchema>
export type DailyLog = z.infer<typeof dailyLogSchema>
export type DayPlan = z.infer<typeof dayPlanSchema>
export type WeeklyReview = z.infer<typeof weeklyReviewSchema>
export type ProgressData = z.infer<typeof progressDataSchema>
export type ProgressFile = z.infer<typeof progressFileSchema>
