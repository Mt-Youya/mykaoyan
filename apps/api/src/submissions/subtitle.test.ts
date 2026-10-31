import { describe, expect, it } from "vitest"

import { MAX_SUBTITLE_CUES, normalizeVtt, parseSubtitle, prepareSubtitle, SubtitleParseError } from "./subtitle"

const srt = [
  "1",
  "00:00:01,000 --> 00:00:03,500",
  "第一句虚构字幕",
  "",
  "2",
  "00:00:04,000 --> 00:00:06,000",
  "第二句虚构字幕",
  "",
].join("\n")

const vtt = ["WEBVTT", "", "00:00:01.000 --> 00:00:02.000 align:start", "虚构字幕", ""].join("\n")

describe("SRT/VTT 解析与归一化", () => {
  it("把 SRT 序号与逗号毫秒归一化为合法 VTT", () => {
    const { vtt: normalized, bytes } = prepareSubtitle(srt, "srt")
    expect(normalized).toBe(
      [
        "WEBVTT",
        "",
        "00:00:01.000 --> 00:00:03.500",
        "第一句虚构字幕",
        "",
        "00:00:04.000 --> 00:00:06.000",
        "第二句虚构字幕",
        "",
      ].join("\n"),
    )
    expect(bytes).toBe(Buffer.byteLength(normalized, "utf8"))
    expect(parseSubtitle(normalized, "vtt")).toHaveLength(2)
  })
  it("接受 VTT 头、cue 编号与省略小时的写法，并丢弃样式设置", () => {
    const content = ["WEBVTT", "", "cue-1", "00:01.000 --> 00:02.500", "虚构", "", "NOTE 注释"].join("\n")
    const cues = parseSubtitle(content, "vtt")
    expect(cues).toEqual([{ start: 1000, end: 2500, text: "虚构" }])
    expect(normalizeVtt(cues).vtt).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.500\n虚构\n")
    expect(parseSubtitle(vtt, "vtt")).toEqual([{ start: 1000, end: 2000, text: "虚构字幕" }])
  })
  it("拒绝格式不符、时间轴非法与空内容", () => {
    expect(() => parseSubtitle(srt, "vtt")).toThrow(SubtitleParseError)
    expect(() => parseSubtitle(vtt, "srt")).toThrow(SubtitleParseError)
    expect(() => parseSubtitle("", "srt")).toThrow("字幕内容为空")
    expect(() => parseSubtitle("1\n00:00:05,000 --> 00:00:05,000\n虚构\n", "srt")).toThrow("开始早于结束")
    expect(() => parseSubtitle("1\n00:00:0x,000 --> 00:00:01,000\n虚构\n", "srt")).toThrow("无法识别的时间轴")
    expect(() => parseSubtitle("1\n没有时间轴\n虚构\n", "srt")).toThrow("缺少时间轴")
    expect(() => parseSubtitle("1\n00:00:00,000 --> 00:00:01,000\n虚构\u0000\n", "srt")).toThrow("NUL")
  })
  it("限制 cue 条数上限", () => {
    const cues = Array.from(
      { length: MAX_SUBTITLE_CUES + 1 },
      (_, index) => `${index + 1}\n00:00:00,000 --> 00:00:01,000\n虚构\n`,
    ).join("\n")
    expect(() => parseSubtitle(cues, "srt")).toThrow("5000")
  })
})
