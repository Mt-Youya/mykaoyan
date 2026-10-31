import { describe, expect, it } from "vitest"

import {
  MANUSCRIPT_MAX_BYTES,
  MANUSCRIPT_MAX_CHARS,
  manuscriptSubmissionInputSchema,
  putSubmissionSubtitlesSchema,
  SUBMISSION_KINDS,
  SUBMISSION_MAX_SUBTITLES,
  SUBMISSION_PART_SIZE,
  submissionInputSchema,
  submissionSubtitleTrackSchema,
  SUBTITLE_MAX_BYTES,
  uploadPartSize,
} from "."

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

const manuscript = {
  id: "10000000-0000-4000-8000-000000000002",
  kind: "manuscript",
  title: "虚构手稿",
  summary: "虚构简介",
  subjectCode: "302",
  topicId: "M01",
  manuscriptMarkdown: "虚构手稿正文，不含任何真实题目。",
}

const track = {
  language: "zh-Hans",
  label: "中文（简体）",
  format: "srt",
  content: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n虚构字幕\n",
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

describe("手稿投稿契约", () => {
  it("接受手稿，拒绝视频形态和未知字段", () => {
    expect(SUBMISSION_KINDS).toEqual(["video", "manuscript"])
    expect(manuscriptSubmissionInputSchema.safeParse(manuscript).success).toBe(true)
    for (const change of [{ kind: "video" }, { objectKey: "fictional/key.mp4" }, { listed: true }])
      expect(manuscriptSubmissionInputSchema.safeParse({ ...manuscript, ...change }).success).toBe(false)
  })
  it("拒绝空标题、超长简介和科目考点不匹配", () => {
    for (const change of [
      { title: "" },
      { title: "虚".repeat(201) },
      { summary: "虚".repeat(2001) },
      { subjectCode: "40" },
      { topicId: "X99" },
    ])
      expect(manuscriptSubmissionInputSchema.safeParse({ ...manuscript, ...change }).success).toBe(false)
  })
  it("按字符数与 UTF-8 字节数双重限制正文，拒绝 NUL 与空正文", () => {
    expect(manuscriptSubmissionInputSchema.safeParse({ ...manuscript, manuscriptMarkdown: "" }).success).toBe(false)
    expect(manuscriptSubmissionInputSchema.safeParse({ ...manuscript, manuscriptMarkdown: "\u0000正文" }).success).toBe(
      false,
    )

    const maxChars = "x".repeat(MANUSCRIPT_MAX_CHARS)
    expect(manuscriptSubmissionInputSchema.safeParse({ ...manuscript, manuscriptMarkdown: maxChars }).success).toBe(
      true,
    )
    expect(
      manuscriptSubmissionInputSchema.safeParse({
        ...manuscript,
        manuscriptMarkdown: "x".repeat(MANUSCRIPT_MAX_CHARS + 1),
      }).success,
    ).toBe(false)

    // 中文每个字符 3 字节：字符数未超限，但字节数超过 1 MiB 时也要拒绝。
    const multibyteMax = "中".repeat(Math.floor(MANUSCRIPT_MAX_BYTES / 3))
    expect(manuscriptSubmissionInputSchema.safeParse({ ...manuscript, manuscriptMarkdown: multibyteMax }).success).toBe(
      true,
    )
    expect(
      manuscriptSubmissionInputSchema.safeParse({ ...manuscript, manuscriptMarkdown: `${multibyteMax}中` }).success,
    ).toBe(false)
  })
})

describe("视频字幕契约", () => {
  it("接受 SRT/VTT 语言标签与显示名，拒绝非法格式和未知字段", () => {
    expect(submissionSubtitleTrackSchema.safeParse(track).success).toBe(true)
    expect(submissionSubtitleTrackSchema.safeParse({ ...track, format: "vtt" }).success).toBe(true)
    expect(submissionSubtitleTrackSchema.safeParse({ ...track, language: "zh" }).success).toBe(true)
    expect(submissionSubtitleTrackSchema.safeParse({ ...track, language: "en-US" }).success).toBe(true)
    for (const change of [
      { format: "ass" },
      { language: "ZH" },
      { language: "zh_Hans" },
      { label: "" },
      { label: "字".repeat(51) },
      { index: 1 },
    ])
      expect(submissionSubtitleTrackSchema.safeParse({ ...track, ...change }).success).toBe(false)
  })
  it("限制单条字幕的 UTF-8 字节数", () => {
    const max = "x".repeat(SUBTITLE_MAX_BYTES)
    expect(submissionSubtitleTrackSchema.safeParse({ ...track, content: max }).success).toBe(true)
    expect(submissionSubtitleTrackSchema.safeParse({ ...track, content: `${max}x` }).success).toBe(false)
    expect(submissionSubtitleTrackSchema.safeParse({ ...track, content: "" }).success).toBe(false)
  })
  it("整体替换为 0–2 条且语言不能重复", () => {
    expect(putSubmissionSubtitlesSchema.safeParse({ tracks: [] }).success).toBe(true)
    expect(putSubmissionSubtitlesSchema.safeParse({ tracks: [track, { ...track, language: "en" }] }).success).toBe(true)
    expect(SUBMISSION_MAX_SUBTITLES).toBe(2)
    expect(
      putSubmissionSubtitlesSchema.safeParse({
        tracks: [track, { ...track, language: "en" }, { ...track, language: "ja" }],
      }).success,
    ).toBe(false)
    expect(putSubmissionSubtitlesSchema.safeParse({ tracks: [track, { ...track }] }).success).toBe(false)
    expect(putSubmissionSubtitlesSchema.safeParse({ tracks: [track], formats: ["srt"] }).success).toBe(false)
  })
})
