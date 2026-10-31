import { SUBTITLE_MAX_BYTES } from "@mykaoyan/core"

/** 一个视频投稿最多接受的 cue 条数；超过视为可疑字幕并拒绝。 */
export const MAX_SUBTITLE_CUES = 5000

export type SubtitleFormat = "srt" | "vtt"

export type SubtitleCue = { start: number; end: number; text: string }

/** 字幕正文无法解析或超出限制时抛出，服务层统一转成 400。 */
export class SubtitleParseError extends Error {}

function pad(value: number, width: number) {
  return String(value).padStart(width, "0")
}

function formatTimestamp(ms: number) {
  return `${pad(Math.floor(ms / 3_600_000), 2)}:${pad(Math.floor(ms / 60_000) % 60, 2)}:${pad(
    Math.floor(ms / 1000) % 60,
    2,
  )}.${pad(ms % 1000, 3)}`
}

function parseTimestamp(value: string, format: SubtitleFormat) {
  // SRT 用逗号作毫秒分隔；VTT 用句点且小时可省略。
  const match =
    format === "srt"
      ? /^(\d{1,3}):([0-5]\d):([0-5]\d),(\d{1,3})$/.exec(value.trim())
      : /^(?:(\d{1,3}):)?([0-5]\d):([0-5]\d)\.(\d{1,3})$/.exec(value.trim())
  if (!match) throw new SubtitleParseError(`无法识别的时间轴：${value.trim() || "空"}`)
  const [, hours, minutes, seconds, milliseconds] = match
  return (
    ((Number(hours ?? "0") * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 +
    Number((milliseconds ?? "0").padEnd(3, "0"))
  )
}

function parseTiming(line: string, format: SubtitleFormat) {
  const parts = line.split("-->")
  if (parts.length !== 2) throw new SubtitleParseError("字幕时间轴须使用 --> 分隔开始与结束")
  const end = parts[1]!.trim().split(/\s+/)[0] ?? ""
  const startMs = parseTimestamp(parts[0]!, format)
  const endMs = parseTimestamp(end, format)
  if (startMs >= endMs) throw new SubtitleParseError("字幕时间轴须满足开始早于结束")
  return { start: startMs, end: endMs }
}

/**
 * 解析上传的 SRT/VTT 文本，返回按原始顺序排列的 cue。
 *
 * 只接受纯文本时间轴：SRT 序号行与逗号毫秒、VTT 的 WEBVTT 头；
 * 拒绝 NUL、cues 超过 5000 条、时间轴非法或格式与声明不符。
 */
export function parseSubtitle(content: string, format: SubtitleFormat): SubtitleCue[] {
  if (content.includes("\u0000")) throw new SubtitleParseError("字幕不能包含 NUL 字符")
  if (Buffer.byteLength(content, "utf8") > SUBTITLE_MAX_BYTES) throw new SubtitleParseError("字幕正文超过 256 KiB 上限")
  const normalized = content.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n")
  const blocks = normalized
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/[ \t]+$/gm, "").trim())
    .filter(Boolean)
  if (!blocks.length) throw new SubtitleParseError("字幕内容为空")
  if (format === "vtt") {
    const header = blocks[0]!.split("\n")[0]!
    if (!/^WEBVTT(?:[ \t].*)?$/.test(header))
      throw new SubtitleParseError("VTT 字幕须以 WEBVTT 开头；若文件是 SRT 请选择 SRT 格式")
    blocks.shift()
  }
  const cues: SubtitleCue[] = []
  for (const block of blocks) {
    const lines = block.split("\n")
    const first = lines[0]!
    if (/^(NOTE|STYLE|REGION)(?:[ \t]|$)/.test(first)) continue
    let timing = first
    let textStart = 1
    if (!first.includes("-->")) {
      const second = lines[1]
      if (second === undefined || !second.includes("-->")) throw new SubtitleParseError("字幕条目缺少时间轴")
      timing = second
      textStart = 2
    }
    const time = parseTiming(timing, format)
    cues.push({ ...time, text: lines.slice(textStart).join("\n").trim() })
    if (cues.length > MAX_SUBTITLE_CUES) throw new SubtitleParseError("字幕条数超过 5000 条上限")
  }
  if (!cues.length) throw new SubtitleParseError("字幕没有可用的时间轴条目")
  return cues
}

/** 把解析后的 cue 统一序列化为 VTT；丢弃 SRT 序号、逗号毫秒与 VTT 样式设置。 */
export function normalizeVtt(cues: SubtitleCue[]): { vtt: string; bytes: number } {
  if (!cues.length) throw new SubtitleParseError("字幕没有可用的时间轴条目")
  const body = cues
    .map((cue) => {
      const timing = `${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`
      return cue.text ? `${timing}\n${cue.text}` : timing
    })
    .join("\n\n")
  const vtt = `WEBVTT\n\n${body}\n`
  const bytes = Buffer.byteLength(vtt, "utf8")
  if (bytes > SUBTITLE_MAX_BYTES) throw new SubtitleParseError("归一化后的字幕正文超过 256 KiB 上限")
  return { vtt, bytes }
}

/** 解析并归一化一条字幕；服务层负责条数、语言与总时长校验。 */
export function prepareSubtitle(content: string, format: SubtitleFormat) {
  const cues = parseSubtitle(content, format)
  const durationMs = Math.max(...cues.map((cue) => cue.end))
  const { vtt, bytes } = normalizeVtt(cues)
  return { vtt, bytes, durationMs }
}
