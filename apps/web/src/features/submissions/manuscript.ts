import { MANUSCRIPT_MAX_BYTES, MANUSCRIPT_MAX_CHARS } from "@mykaoyan/core"
export type ManuscriptStats = { chars: number; bytes: number }
/**
 * 手稿字符数与 UTF-8 字节数。
 *
 * 字符口径与契约的 `max` 一致（UTF-16 码元），字节口径按 UTF-8 编码。
 */
export function manuscriptStats(markdown: string): ManuscriptStats {
  return { chars: markdown.length, bytes: new TextEncoder().encode(markdown).length }
}
/** 上传前的正文预检；最终限制仍以服务端校验为准。 */
export function manuscriptProblem(stats: ManuscriptStats) {
  if (stats.chars === 0) return "手稿正文不能为空"
  if (stats.chars > MANUSCRIPT_MAX_CHARS) return `手稿正文不得超过${MANUSCRIPT_MAX_CHARS}字符`
  if (stats.bytes > MANUSCRIPT_MAX_BYTES) return `手稿正文UTF-8字节数不得超过${MANUSCRIPT_MAX_BYTES}`
  return null
}
/** 手稿字节数的展示文案；列表不加载正文，只给大小。 */
export function manuscriptSizeLabel(bytes: number | null) {
  return bytes === null ? "" : `手稿约${Math.max(1, Math.ceil(bytes / 1024))}KB`
}
