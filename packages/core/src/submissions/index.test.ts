import { describe, expect, it } from "vitest"
import { submissionInputSchema, uploadPartSize, SUBMISSION_PART_SIZE } from "./index"
const valid = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "虚构讲解",
  summary: "虚构简介",
  subjectCode: "302",
  topicId: "M01",
  size: 500_000_000,
  duration: 1800,
  codec: "h264",
  contentType: "video/mp4",
  fingerprint: "a".repeat(64),
}
describe("投稿文件与分片规则", () => {
  it("接受边界，拒绝大小、时长、编码和科目考点不匹配", () => {
    expect(submissionInputSchema.safeParse(valid).success).toBe(true)
    for (const change of [
      { size: 500_000_001 },
      { duration: 1801 },
      { duration: 0 },
      { codec: "hevc" },
      { contentType: "video/webm" },
      { subjectCode: "408" },
      { topicId: "X99" },
      { accountId: "forged" },
    ])
      expect(submissionInputSchema.safeParse({ ...valid, ...change }).success).toBe(false)
    expect(uploadPartSize(SUBMISSION_PART_SIZE + 123, 2)).toBe(123)
    expect(() => uploadPartSize(100, 2)).toThrow()
  })
})
