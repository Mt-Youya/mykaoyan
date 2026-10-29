import { vocabDataSchema } from "@mykaoyan/core"
import type { VocabData, VocabEntry } from "@mykaoyan/core"

export const emptyVocabData: VocabData = { entries: [], cards: [], reviewLogs: [] }

/** 每行以 Tab 分隔单词与释义；只接受考生自己保管的内容。 */
export function parsePastedVocab(source: string, createId: () => string): VocabEntry[] {
  const entries = source
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      const divider = line.indexOf("\t")
      if (divider < 1) throw new Error(`第 ${index + 1} 行请用 Tab 分隔单词与释义`)
      const term = line.slice(0, divider).trim()
      const meaning = line.slice(divider + 1).trim()
      if (!term || !meaning) throw new Error(`第 ${index + 1} 行的单词和释义都不能为空`)
      return { id: createId(), term, meaning }
    })
  if (!entries.length) throw new Error("词表不能为空")
  if (new Set(entries.map((entry) => `${entry.term}\u0000${entry.meaning}`)).size !== entries.length)
    throw new Error("导入内容有重复词条")
  return vocabDataSchema.shape.entries.parse(entries)
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
