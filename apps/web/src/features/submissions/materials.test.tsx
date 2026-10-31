import { describe, expect, it } from "vitest"

import { MANUSCRIPT_MAX_BYTES, MANUSCRIPT_MAX_CHARS, SUBTITLE_MAX_BYTES } from "@mykaoyan/core"

import type { OwnSubmission } from "./api"
import { manuscriptProblem, manuscriptSizeLabel, manuscriptStats } from "./manuscript"
import { canEditSubtitles, submissionCleanupNote, uploadEntryMode } from "./model"
import {
  defaultSubtitleMeta,
  inspectSubtitleText,
  readSubtitleFile,
  subtitleCueCount,
  subtitleFormatFromName,
  subtitleLimitProblem,
} from "./subtitles"
describe("手稿表单预检", () => {
  it("按字符与UTF-8字节数统计并提示超限", () => {
    expect(manuscriptStats("虚构手稿")).toEqual({ chars: 4, bytes: 12 })
    expect(manuscriptProblem({ chars: 0, bytes: 0 })).toBe("手稿正文不能为空")
    expect(manuscriptProblem({ chars: MANUSCRIPT_MAX_CHARS, bytes: MANUSCRIPT_MAX_BYTES })).toBeNull()
    expect(manuscriptProblem({ chars: MANUSCRIPT_MAX_CHARS + 1, bytes: 10 })).toContain("1000000")
    expect(manuscriptProblem({ chars: 10, bytes: MANUSCRIPT_MAX_BYTES + 1 })).toContain("字节")
    expect(manuscriptSizeLabel(2048)).toBe("手稿约2KB")
    expect(manuscriptSizeLabel(1)).toBe("手稿约1KB")
    expect(manuscriptSizeLabel(null)).toBe("")
  })
})
describe("字幕上传前预检", () => {
  const srt = "1\n00:00:01,000 --> 00:00:02,000\n虚构字幕\n",
    vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n虚构字幕\n"
  it("只接受SRT/VTT扩展名与合法时间轴", () => {
    expect(subtitleFormatFromName("虚构.SRT")).toBe("srt")
    expect(subtitleFormatFromName("fictional.vtt")).toBe("vtt")
    expect(() => subtitleFormatFromName("虚构.ass")).toThrow("SRT或VTT")
    expect(() => subtitleFormatFromName("无扩展名")).toThrow()
    expect(inspectSubtitleText(srt, "srt")).toBe(srt)
    expect(inspectSubtitleText(vtt, "vtt")).toBe(vtt)
    expect(() => inspectSubtitleText("", "srt")).toThrow("内容为空")
    expect(() => inspectSubtitleText("没有时间轴", "srt")).toThrow("缺少时间轴")
    expect(() => inspectSubtitleText("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n虚构\n", "srt")).toThrow("缺少时间轴")
    expect(() => inspectSubtitleText(srt, "vtt")).toThrow("WEBVTT")
    expect(() => inspectSubtitleText("x".repeat(SUBTITLE_MAX_BYTES + 1), "srt")).toThrow("256KiB")
  })
  it("统计cue条数并限制最多两条", () => {
    expect(subtitleCueCount(srt)).toBe(1)
    expect(subtitleCueCount(`${srt}\n2\n00:00:03,000 --> 00:00:04,000\n虚构\n`)).toBe(2)
    expect(subtitleLimitProblem(0)).toBeNull()
    expect(subtitleLimitProblem(1)).toBeNull()
    expect(subtitleLimitProblem(2)).toContain("最多2条")
    expect(defaultSubtitleMeta("虚构中文.srt", [])).toEqual({ language: "zh", label: "虚构中文" })
    expect(defaultSubtitleMeta("fictional-en.vtt", [{ language: "zh" }])).toEqual({
      language: "en",
      label: "fictional-en",
    })
    expect(defaultSubtitleMeta(".srt", [])).toEqual({ language: "zh", label: "字幕" })
  })
  it("读取字幕文件时按大小与内容拒绝", async () => {
    await expect(readSubtitleFile(new File([srt], "虚构.srt", { type: "text/plain" }))).resolves.toMatchObject({
      format: "srt",
      content: srt,
    })
    await expect(readSubtitleFile(new File([""], "虚构.ass"))).rejects.toThrow("SRT或VTT")
    await expect(readSubtitleFile(new File(["x".repeat(SUBTITLE_MAX_BYTES + 1)], "虚构.vtt"))).rejects.toThrow("256KiB")
  })
})
describe("我的投稿字幕编辑条件", () => {
  const submission = (change: Partial<OwnSubmission>): OwnSubmission => ({
    id: "fictional",
    kind: "video",
    title: "虚构投稿",
    summary: "",
    subjectCode: "302",
    topicId: null,
    author: "考生",
    duration: 10,
    status: "pending",
    listed: false,
    manuscriptBytes: null,
    createdAt: new Date().toISOString(),
    size: 100,
    fingerprint: "a".repeat(64),
    reason: null,
    reviewedAt: null,
    deleteMarked: false,
    deleted: false,
    hasManuscript: false,
    hasSubtitles: false,
    subtitleLanguages: [],
    subtitles: [],
    ...change,
  })
  it("只有本人未审核视频可以改字幕", () => {
    expect(canEditSubtitles(submission({}))).toBe(true)
    expect(canEditSubtitles(submission({ reviewedAt: new Date().toISOString(), status: "approved" }))).toBe(false)
    expect(canEditSubtitles(submission({ kind: "manuscript" }))).toBe(false)
    expect(canEditSubtitles(submission({ deleted: true }))).toBe(false)
    expect(canEditSubtitles(submission({ deleteMarked: true }))).toBe(false)
  })
})
describe("投稿入口与清理状态提示", () => {
  it("访客先登录，非会员与会员都能打开投稿表单", () => {
    expect(uploadEntryMode("loading")).toBe("loading")
    expect(uploadEntryMode("error")).toBe("error")
    expect(uploadEntryMode("guest")).toBe("login")
    expect(uploadEntryMode("nonmember")).toBe("open")
    expect(uploadEntryMode("member")).toBe("open")
  })
  it("区分视频与手稿的清理提示", () => {
    expect(submissionCleanupNote({ kind: "video", deleted: false, deleteMarked: false })).toBeNull()
    expect(submissionCleanupNote({ kind: "video", deleted: true, deleteMarked: false })).toContain("原文件")
    expect(submissionCleanupNote({ kind: "manuscript", deleted: true, deleteMarked: false })).toContain("正文")
    expect(submissionCleanupNote({ kind: "video", deleted: false, deleteMarked: true })).toContain("等待清理")
  })
})
