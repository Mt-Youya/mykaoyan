import { describe, expect, it } from "vitest"

import { getTodayTasks } from "."
import { parseLocalDate } from "../dates"
import { mistakeSchema, progressFileSchema } from "../progress"
import type { Mistake, RetestAttempt } from "../progress"
import { fullProgressFileFixture } from "../progress/fixtures"

const base = progressFileSchema.parse(fullProgressFileFixture.value).data.mistakes[0]!

function mistake(id: string, correctedOn: string, retests: RetestAttempt[] = []): Mistake {
  return mistakeSchema.parse({ ...base, id, correctedOn, retests })
}

const today = parseLocalDate("2030-03-10")

describe("今日页排序", () => {
  it("逾期复测（逾期最久在前）→ 今天的复测 → 到期卡 → 新卡", () => {
    const tasks = getTodayTasks(
      [
        mistake("future", "2030-03-09"),
        mistake("today", "2030-03-08"),
        mistake("overdue-5", "2030-03-02"),
        mistake("overdue-7", "2030-03-01"),
        { ...base, id: "stable" },
      ],
      { due: 3, newAvailable: 4 },
      today,
    )
    expect(tasks.map((task) => task.kind)).toEqual([
      "overdue-retest",
      "overdue-retest",
      "today-retest",
      "due-cards",
      "new-cards",
    ])
    expect(tasks[0]).toMatchObject({ kind: "overdue-retest", due: { mistake: { id: "overdue-7" } } })
    expect(tasks[1]).toMatchObject({ kind: "overdue-retest", due: { mistake: { id: "overdue-5" } } })
    expect(tasks[2]).toMatchObject({ kind: "today-retest", due: { mistake: { id: "today" } } })
    expect(tasks[3]).toEqual({ kind: "due-cards", count: 3 })
    expect(tasks[4]).toEqual({ kind: "new-cards", count: 4 })
  })

  it("数量为 0 的单词卡条目不出现；本地没有词表时只显示复测", () => {
    const tasks = getTodayTasks([mistake("overdue", "2030-03-01")], { due: 0, newAvailable: 0 }, today)
    expect(tasks.map((task) => task.kind)).toEqual(["overdue-retest"])
    expect(getTodayTasks([mistake("overdue", "2030-03-01")], null, today).map((task) => task.kind)).toEqual([
      "overdue-retest",
    ])
  })

  it("没有待办时返回空列表", () => {
    expect(getTodayTasks([], null, today)).toEqual([])
    expect(getTodayTasks([], { due: 0, newAvailable: 0 }, today)).toEqual([])
  })

  it("只引入新卡时排在最后", () => {
    const tasks = getTodayTasks([], { due: 0, newAvailable: 5 }, today)
    expect(tasks).toEqual([{ kind: "new-cards", count: 5 }])
  })
})
