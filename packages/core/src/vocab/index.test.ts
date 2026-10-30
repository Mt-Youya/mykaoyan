import { describe, expect, it } from "vitest"

import { parseLocalDate } from "../dates/index"
import {
  createVocabCard,
  DAILY_NEW_CARD_LIMIT,
  getVocabCounts,
  getVocabQueue,
  reviewVocabCard,
  scheduleVocabCard,
} from "./index"
import type { VocabData } from "./index"

const entries = [
  { id: "one", term: "one", meaning: "一" },
  { id: "two", term: "two", meaning: "二" },
]

describe("单词复习调度", () => {
  it("正确回忆的新卡按 1、3 天再乘记忆系数排期", () => {
    const first = scheduleVocabCard(
      createVocabCard("one", parseLocalDate("2026-10-22")),
      "good",
      parseLocalDate("2026-10-22"),
    )
    const second = scheduleVocabCard(first, "good", parseLocalDate("2026-10-23"))
    const third = scheduleVocabCard(second, "good", parseLocalDate("2026-10-26"))
    expect([first.intervalDays, second.intervalDays, third.intervalDays]).toEqual([1, 3, 8])
    expect(third.due).toBe("2026-11-03")
  })

  it("到期卡未清空时不引入新卡，评分后才按上限引入", () => {
    const due = { ...createVocabCard("one", parseLocalDate("2026-10-01")), due: parseLocalDate("2026-10-22") }
    const data: VocabData = { entries, cards: [due], reviewLogs: [] }
    expect(getVocabCounts(data, parseLocalDate("2026-10-22"))).toEqual({ due: 1, newAvailable: 0 })
    const reviewed = reviewVocabCard(data, "one", "good", parseLocalDate("2026-10-22"))
    expect(getVocabQueue(reviewed, parseLocalDate("2026-10-22")).map((item) => item.entry.id)).toEqual(["two"])
  })

  it("忘记会重置间隔并且不会允许旧队列重复评分", () => {
    const data: VocabData = { entries, cards: [], reviewLogs: [] }
    const reviewed = reviewVocabCard(data, "one", "again", parseLocalDate("2026-10-22"))
    expect(reviewed.cards[0]).toMatchObject({ intervalDays: 1, reps: 0, lapses: 1, due: "2026-10-23" })
    expect(() => reviewVocabCard(reviewed, "one", "good", parseLocalDate("2026-10-22"))).toThrow("队列已更新")
  })
})

describe("评分对应记忆系数", () => {
  const today = parseLocalDate("2026-10-22")

  it("困难降低 ease，轻松提高 ease 并让间隔额外乘 1.3", () => {
    const card = createVocabCard("one", today)
    expect(scheduleVocabCard(card, "hard", today).ease).toBe(2.35)
    const easy = scheduleVocabCard(scheduleVocabCard(card, "good", today), "easy", parseLocalDate("2026-10-23"))
    expect(easy.ease).toBe(2.65)
    expect(easy.intervalDays).toBe(4)
  })

  it("ease 下限为 1.3", () => {
    let card = createVocabCard("one", today)
    for (let index = 0; index < 10; index += 1) {
      card = scheduleVocabCard(card, "again", parseLocalDate(`2026-11-${String(index + 1).padStart(2, "0")}`))
    }
    expect(card.ease).toBe(1.3)
  })

  it("评分日期不能早于上次复习日期", () => {
    const card = scheduleVocabCard(createVocabCard("one", today), "good", today)
    expect(() => scheduleVocabCard(card, "good", parseLocalDate("2026-10-21"))).toThrow("不能早于")
  })
})

describe("新卡上限与队列顺序", () => {
  const today = parseLocalDate("2026-10-22")
  const manyEntries = Array.from({ length: DAILY_NEW_CARD_LIMIT + 10 }, (_, index) => ({
    id: `entry-${index}`,
    term: `term-${index}`,
    meaning: `释义 ${index}`,
  }))

  it("同一天最多引入 30 张新卡，已引入的新卡计入上限", () => {
    const empty: VocabData = { entries: manyEntries, cards: [], reviewLogs: [] }
    expect(getVocabQueue(empty, today)).toHaveLength(DAILY_NEW_CARD_LIMIT)
    const introduced = {
      ...empty,
      cards: manyEntries
        .slice(0, 10)
        .map((entry) => scheduleVocabCard(createVocabCard(entry.id, today), "good", today)),
    }
    expect(getVocabQueue(introduced, today)).toHaveLength(DAILY_NEW_CARD_LIMIT - 10)
  })

  it("到期卡按到期日期先后排列，且优先于新卡", () => {
    const cards = [
      { ...createVocabCard("two", today), due: parseLocalDate("2026-10-20") },
      { ...createVocabCard("one", today), due: parseLocalDate("2026-10-19") },
    ]
    const data: VocabData = { entries, cards, reviewLogs: [] }
    expect(getVocabQueue(data, today).map((item) => item.entry.id)).toEqual(["one", "two"])
  })

  it("复习记录按天累计", () => {
    const first = reviewVocabCard({ entries, cards: [], reviewLogs: [] }, "one", "good", today)
    const second = reviewVocabCard(first, "two", "good", today)
    expect(second.reviewLogs).toEqual([{ date: today, reviews: 2, newCards: 2 }])
  })
})
