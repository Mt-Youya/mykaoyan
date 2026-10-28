import { describe, expect, it } from "vitest"
import { parseLocalDate } from "../dates/index"
import { createVocabCard, getVocabCounts, getVocabQueue, reviewVocabCard, scheduleVocabCard } from "./index"
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
      parseLocalDate("2026-10-22")
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
