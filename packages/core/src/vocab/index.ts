import { z } from "zod"

import { addDays, localDateSchema } from "../dates"
import type { LocalDate } from "../dates"

const nonBlankText = z.string().trim().min(1).max(500)

export const vocabGradeSchema = z.enum(["again", "hard", "good", "easy"])
export type VocabGrade = z.infer<typeof vocabGradeSchema>

export const vocabEntrySchema = z.strictObject({
  id: nonBlankText,
  term: nonBlankText,
  meaning: nonBlankText,
})
export type VocabEntry = z.infer<typeof vocabEntrySchema>

export const vocabCardSchema = z.strictObject({
  entryId: nonBlankText,
  ease: z.number().min(1.3),
  intervalDays: z.number().int().nonnegative(),
  due: localDateSchema,
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  introducedOn: localDateSchema,
  lastReviewedOn: localDateSchema,
})
export type VocabCard = z.infer<typeof vocabCardSchema>

export const vocabReviewLogSchema = z.strictObject({
  date: localDateSchema,
  reviews: z.number().int().nonnegative(),
  newCards: z.number().int().nonnegative(),
})
export type VocabReviewLog = z.infer<typeof vocabReviewLogSchema>

export const vocabDataSchema = z.strictObject({
  entries: z.array(vocabEntrySchema),
  cards: z.array(vocabCardSchema),
  reviewLogs: z.array(vocabReviewLogSchema),
})
export type VocabData = z.infer<typeof vocabDataSchema>

export const DAILY_NEW_CARD_LIMIT = 30

export function createVocabCard(entryId: string, today: LocalDate): VocabCard {
  return vocabCardSchema.parse({
    entryId,
    ease: 2.5,
    intervalDays: 0,
    due: today,
    reps: 0,
    lapses: 0,
    introducedOn: today,
    lastReviewedOn: today,
  })
}

export function scheduleVocabCard(card: VocabCard, grade: VocabGrade, today: LocalDate): VocabCard {
  vocabCardSchema.parse(card)
  vocabGradeSchema.parse(grade)
  if (today < card.lastReviewedOn) throw new Error("评分日期不能早于上次复习日期")
  const delta = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 }[grade]
  const ease = Math.max(1.3, Math.round((card.ease + delta) * 100) / 100)
  const base = card.reps === 0 ? 1 : card.reps === 1 ? 3 : Math.round(card.intervalDays * ease)
  const intervalDays = grade === "again" ? 1 : Math.max(1, Math.round(base * (grade === "easy" ? 1.3 : 1)))
  return vocabCardSchema.parse({
    ...card,
    ease,
    intervalDays,
    due: addDays(today, intervalDays),
    reps: grade === "again" ? 0 : card.reps + 1,
    lapses: card.lapses + (grade === "again" ? 1 : 0),
    lastReviewedOn: today,
  })
}

export type VocabQueueItem = { entry: VocabEntry; card: VocabCard | null }

/** 到期卡必须清空后才引入新卡；同一天最多引入 30 张。 */
export function getVocabQueue(
  data: VocabData,
  today: LocalDate,
  newCardLimit = DAILY_NEW_CARD_LIMIT,
): VocabQueueItem[] {
  const limit = z.number().int().min(0).parse(newCardLimit)
  const entries = new Map(data.entries.map((entry) => [entry.id, entry]))
  const cards = data.cards.filter((card) => entries.has(card.entryId))
  const due = cards
    .filter((card) => card.due <= today)
    .toSorted((left, right) => left.due.localeCompare(right.due))
    .map((card) => ({ entry: entries.get(card.entryId)!, card }))
  if (due.length) return due

  const learned = new Set(cards.map((card) => card.entryId))
  const introducedToday = cards.filter((card) => card.introducedOn === today).length
  return data.entries
    .filter((entry) => !learned.has(entry.id))
    .slice(0, Math.max(0, limit - introducedToday))
    .map((entry) => ({ entry, card: null }))
}

export function getVocabCounts(data: VocabData, today: LocalDate, newCardLimit = DAILY_NEW_CARD_LIMIT) {
  const queue = getVocabQueue(data, today, newCardLimit)
  const due = queue.filter((item) => item.card !== null).length
  return { due, newAvailable: due ? 0 : queue.length }
}

/** 只允许为当前队首评分，避免旧页面把已被别处更新的卡片重复写入。 */
export function reviewVocabCard(
  data: VocabData,
  entryId: string,
  grade: VocabGrade,
  today: LocalDate,
  newCardLimit = DAILY_NEW_CARD_LIMIT,
): VocabData {
  const current = getVocabQueue(data, today, newCardLimit)[0]
  if (!current || current.entry.id !== entryId) throw new Error("复习队列已更新，请查看当前卡片后重新评分")
  const card = scheduleVocabCard(current.card ?? createVocabCard(entryId, today), grade, today)
  const cards = current.card
    ? data.cards.map((item) => (item.entryId === entryId ? card : item))
    : [...data.cards, card]
  const log = data.reviewLogs.find((item) => item.date === today)
  const nextLog: VocabReviewLog = {
    date: today,
    reviews: (log?.reviews ?? 0) + 1,
    newCards: (log?.newCards ?? 0) + (current.card ? 0 : 1),
  }
  return vocabDataSchema.parse({
    ...data,
    cards,
    reviewLogs: log
      ? data.reviewLogs.map((item) => (item.date === today ? nextLog : item))
      : [...data.reviewLogs, nextLog],
  })
}
