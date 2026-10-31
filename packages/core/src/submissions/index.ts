import { z } from "zod"

import { utf8ByteLength } from "../bytes"
import { publicTopics } from "../topics"
export const SUBMISSION_MAX_SIZE = 500_000_000
export const SUBMISSION_PART_SIZE = 8 * 1024 * 1024

/** 投稿的两种形态：视频（R2 中的 mp4）与手稿（Markdown 正文直存数据库）。 */
export const SUBMISSION_KINDS = ["video", "manuscript"] as const
/** 手稿正文的字符与 UTF-8 字节上限；字节口径与数据库 `octet_length` 一致。 */
export const MANUSCRIPT_MAX_CHARS = 1_000_000
export const MANUSCRIPT_MAX_BYTES = 1_048_576
/** 一条字幕归一化后的 VTT 正文上限；一个视频投稿最多两条字幕。 */
export const SUBTITLE_MAX_BYTES = 262_144
export const SUBMISSION_MAX_SUBTITLES = 2
/** 字幕允许的上传格式；服务端统一归一化为 VTT 存储。 */
export const SUBTITLE_FORMATS = ["srt", "vtt"] as const
export const submissionInputSchema = z
  .strictObject({
    id: z.uuid(),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().max(2000),
    subjectCode: z.string().regex(/^[0-9]{3}$/),
    topicId: z.string().nullable(),
    size: z.number().int().min(1).max(SUBMISSION_MAX_SIZE),
    duration: z.number().positive().max(1800),
    codec: z.literal("h264"),
    contentType: z.literal("video/mp4"),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .refine((v) => v.topicId === null || publicTopics.some((t) => t.id === v.topicId && t.subject === v.subjectCode), {
    message: "考点不属于所选考试科目",
  })
export type SubmissionInput = z.infer<typeof submissionInputSchema>

/** 手稿投稿输入：单请求写入，`id` 由客户端生成用于幂等重试。 */
export const manuscriptSubmissionInputSchema = z
  .strictObject({
    id: z.uuid(),
    kind: z.literal("manuscript"),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().max(2000),
    subjectCode: z.string().regex(/^[0-9]{3}$/),
    topicId: z.string().nullable(),
    manuscriptMarkdown: z
      .string()
      .min(1)
      .max(MANUSCRIPT_MAX_CHARS)
      .refine((value) => !value.includes("\u0000"), { message: "手稿不能包含 NUL 字符" })
      .refine((value) => utf8ByteLength(value) <= MANUSCRIPT_MAX_BYTES, { message: "手稿 UTF-8 字节数超过上限" }),
  })
  .refine((v) => v.topicId === null || publicTopics.some((t) => t.id === v.topicId && t.subject === v.subjectCode), {
    message: "考点不属于所选考试科目",
  })
export type ManuscriptSubmissionInput = z.infer<typeof manuscriptSubmissionInputSchema>

/** 一条字幕轨：服务端解析 SRT/VTT 后以归一化的 VTT 正文与字节数入库。 */
export const submissionSubtitleTrackSchema = z.strictObject({
  language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
  label: z.string().trim().min(1).max(50),
  format: z.enum(SUBTITLE_FORMATS),
  content: z
    .string()
    .min(1)
    .refine((value) => utf8ByteLength(value) <= SUBTITLE_MAX_BYTES, { message: "字幕正文 UTF-8 字节数超过上限" }),
})
export type SubmissionSubtitleTrack = z.infer<typeof submissionSubtitleTrackSchema>

/** 整体替换一个视频投稿的字幕轨：0–2 条，同一投稿内语言不能重复。 */
export const putSubmissionSubtitlesSchema = z
  .strictObject({
    tracks: z.array(submissionSubtitleTrackSchema).max(SUBMISSION_MAX_SUBTITLES),
  })
  .refine((value) => new Set(value.tracks.map((track) => track.language)).size === value.tracks.length, {
    message: "同一投稿的字幕语言不能重复",
  })
export type PutSubmissionSubtitles = z.infer<typeof putSubmissionSubtitlesSchema>

export function uploadPartSize(size: number, part: number): number {
  const count = Math.ceil(size / SUBMISSION_PART_SIZE)
  if (!Number.isInteger(part) || part < 1 || part > count) throw new Error("分片编号无效")
  return Math.min(SUBMISSION_PART_SIZE, size - (part - 1) * SUBMISSION_PART_SIZE)
}
