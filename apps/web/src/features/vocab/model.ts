import { vocabDataSchema } from "@mykaoyan/core"
import type { VocabData, VocabEntry } from "@mykaoyan/core"

export const emptyVocabData: VocabData = { entries: [], cards: [], reviewLogs: [] }

type ParsedRow = { term: string; meaning: string }

function entryFromRow(row: ParsedRow, index: number, createId: () => string): VocabEntry {
  const term = row.term.trim()
  const meaning = row.meaning.trim()
  if (!term || !meaning) throw new Error(`第 ${index + 1} 行的单词和释义都不能为空`)
  return { id: createId(), term, meaning }
}

/** 按分隔符切分一行；CSV 支持双引号包裹的字段与成对双引号转义。 */
function splitLine(line: string, delimiter: "\t" | ","): string[] {
  if (delimiter === "\t") return line.split("\t")
  const fields: string[] = []
  let current = ""
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (quoted) {
      if (character !== '"') current += character
      else if (line[index + 1] === '"') {
        current += '"'
        index += 1
      } else quoted = false
    } else if (character === '"' && current === "") quoted = true
    else if (character === ",") {
      fields.push(current)
      current = ""
    } else current += character
  }
  fields.push(current)
  return fields
}

function parseDelimited(source: string): ParsedRow[] {
  const lines = source.split(/\r?\n/).filter((line) => line.trim())
  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ","
  return lines.map((line, index) => {
    const fields = splitLine(line, delimiter).map((field) => field.trim())
    if (fields.length < 2) throw new Error(`第 ${index + 1} 行请用 Tab 或逗号分隔单词与释义`)
    return { term: fields[0]!, meaning: fields.slice(1).join(delimiter) }
  })
}

/** 解析 JSON 词表：对象数组、二元数组数组，或 term 到 meaning 的对象。 */
function parseJson(source: string): ParsedRow[] {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error("JSON 词表无法解析，请检查文件格式")
  }
  const rows: ParsedRow[] = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === "string" && item.includes("\t")) {
        const [term, ...rest] = item.split("\t")
        rows.push({ term: term ?? "", meaning: rest.join("\t") })
      } else if (Array.isArray(item) && item.length >= 2) {
        if (typeof item[0] !== "string" || typeof item[1] !== "string")
          throw new Error(`JSON 第 ${index + 1} 项的单词与释义都必须是字符串`)
        rows.push({ term: item[0], meaning: item[1] })
      } else if (item && typeof item === "object") {
        const record = item as Record<string, unknown>
        if (typeof record.term !== "string" || typeof record.meaning !== "string")
          throw new Error(`JSON 第 ${index + 1} 项需要 term 与 meaning 字符串`)
        rows.push({ term: record.term, meaning: record.meaning })
      } else throw new Error(`JSON 第 ${index + 1} 项不是可识别的词条`)
    })
  } else if (value && typeof value === "object") {
    for (const [term, meaning] of Object.entries(value as Record<string, unknown>)) {
      if (typeof meaning !== "string") throw new Error(`JSON 中「${term}」的释义必须是字符串`)
      rows.push({ term, meaning })
    }
  } else throw new Error("JSON 词表需要数组或对象")
  return rows
}

/** 解析 CSV、TSV 或 JSON 词表文本；只接受考生自己保管的内容。 */
export function parseVocabText(source: string, createId: () => string): VocabEntry[] {
  const trimmed = source.trim()
  if (!trimmed) throw new Error("词表不能为空")
  const rows = trimmed.startsWith("[") || trimmed.startsWith("{") ? parseJson(trimmed) : parseDelimited(trimmed)
  if (!rows.length) throw new Error("词表不能为空")
  const entries = rows.map((row, index) => entryFromRow(row, index, createId))
  if (new Set(entries.map((entry) => `${entry.term}\u0000${entry.meaning}`)).size !== entries.length)
    throw new Error("导入内容有重复词条")
  return vocabDataSchema.shape.entries.parse(entries)
}

/** 兼容旧入口：粘贴框默认是 Tab 分隔，也接受 CSV/JSON。 */
export function parsePastedVocab(source: string, createId: () => string): VocabEntry[] {
  return parseVocabText(source, createId)
}

export function mergeVocabEntries(current: VocabEntry[], incoming: VocabEntry[]) {
  const known = new Set(current.map((entry) => `${entry.term}\u0000${entry.meaning}`))
  const entries = incoming.filter((entry) => !known.has(`${entry.term}\u0000${entry.meaning}`))
  return { entries: [...current, ...entries], added: entries.length }
}

/** 备份内容摘要：导入前列出各类条目数。 */
export function summarizeBackup(data: VocabData) {
  return { entries: data.entries.length, cards: data.cards.length, reviewDays: data.reviewLogs.length }
}
