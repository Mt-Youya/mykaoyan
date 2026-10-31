import { SUBMISSION_MAX_SUBTITLES, SUBTITLE_MAX_BYTES } from "@mykaoyan/core"
export type SubtitleFormat = "srt" | "vtt"
export type SubtitleDraft = { language: string; label: string; format: SubtitleFormat; content: string }
/** 按扩展名判断字幕格式；只接受 SRT/VTT 纯文本。 */
export function subtitleFormatFromName(name: string): SubtitleFormat {
  const extension = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase()
  if (extension === "srt") return "srt"
  if (extension === "vtt") return "vtt"
  throw new Error("字幕只支持SRT或VTT文本文件")
}
/** 上传前的结构性预检：非空、大小、首行与时间轴；归一化以服务端为准。 */
export function inspectSubtitleText(content: string, format: SubtitleFormat) {
  const text = content.replace(/^\ufeff/, "")
  if (!text.trim()) throw new Error("字幕内容为空")
  if (new TextEncoder().encode(text).length > SUBTITLE_MAX_BYTES) throw new Error("单条字幕不得超过256KiB")
  if (format === "vtt" && !/^WEBVTT(?:[ \t].*)?(?:\r?\n|$)/.test(text.trimStart()))
    throw new Error("VTT字幕须以WEBVTT开头")
  const timing =
    format === "srt"
      ? /^[ \t]*\d{1,3}:[0-5]\d:[0-5]\d,\d{1,3}[ \t]*-->/m
      : /^[ \t]*(?:\d{1,3}:)?[0-5]\d:[0-5]\d\.\d{1,3}[ \t]*-->/m
  if (!timing.test(text)) throw new Error(format === "srt" ? "SRT字幕缺少时间轴" : "VTT字幕缺少时间轴")
  return text
}
/** cue 条数按含时间轴的行统计；服务端仍会按 5000 条上限严格解析。 */
export function subtitleCueCount(content: string) {
  return content.split(/\r?\n/).filter((line) => line.includes("-->")).length
}
/** 最多两条字幕：已满时前端只提示，不替代服务端校验。 */
export function subtitleLimitProblem(count: number) {
  return count >= SUBMISSION_MAX_SUBTITLES ? `最多${SUBMISSION_MAX_SUBTITLES}条字幕` : null
}
/** 新字幕的默认语言与显示名：已有中文时优先英文，避免语言重复。 */
export function defaultSubtitleMeta(filename: string, existing: { language: string }[]) {
  const language = existing.some((track) => track.language === "zh") ? "en" : "zh"
  const label = filename.replace(/\.[A-Za-z0-9]+$/, "").slice(0, 50) || "字幕"
  return { language, label }
}
/** 读取并预检一个字幕文件；文件过大时先拒绝，不整文件读入。 */
export async function readSubtitleFile(file: File) {
  const format = subtitleFormatFromName(file.name)
  if (file.size > SUBTITLE_MAX_BYTES) throw new Error("单条字幕文件不得超过256KiB")
  return { format, content: inspectSubtitleText(await file.text(), format) }
}
