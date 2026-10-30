import { z } from "zod"

import { publicTopics } from "../topics"
export const SUBMISSION_MAX_SIZE = 500_000_000
export const SUBMISSION_PART_SIZE = 8 * 1024 * 1024
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
export function uploadPartSize(size: number, part: number): number {
  const count = Math.ceil(size / SUBMISSION_PART_SIZE)
  if (!Number.isInteger(part) || part < 1 || part > count) throw new Error("分片编号无效")
  return Math.min(SUBMISSION_PART_SIZE, size - (part - 1) * SUBMISSION_PART_SIZE)
}
