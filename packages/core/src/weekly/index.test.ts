import { describe, expect, it } from "vitest"
import { parseLocalDate } from "../dates/index"
import { progressFileSchema } from "../progress/index"
import type { WeeklyReview } from "../progress/index"
import { fullProgressFileFixture } from "../progress/fixtures/index"
import { publicTopics } from "../topics/index"
import { getWeeklyReview, getWeeklySummary, startOfWeek, upsertWeeklyReview } from "./index"

const file = progressFileSchema.parse(fullProgressFileFixture.value)
const weekStart = parseLocalDate("2030-03-04")

function summary(mistakes = file.data.mistakes) {
  return getWeeklySummary({
    profile: file.data.profile,
    dayPlans: file.data.dayPlans,
    daily: file.data.daily,
    mistakes,
    topics: publicTopics,
    progress: file.data.progress,
    weekStart,
  })
}

describe("一周从周一开始", () => {
  it.each([
    ["2030-03-04", "2030-03-04"],
    ["2030-03-08", "2030-03-04"],
    ["2030-03-10", "2030-03-04"],
    ["2030-03-11", "2030-03-11"],
  ])("%s 所在周的周一是 %s", (date, expected) => {
    expect(startOfWeek(parseLocalDate(date))).toBe(expected)
  })
})

describe("周复盘汇总", () => {
  it("各科实际学习时长来自每日记录，计划分钟按当天生效计划累加", () => {
    const result = summary()
    expect(result.days).toHaveLength(7)
    expect(result.subjects).toEqual([
      { code: "302", name: "数学（二）", plannedMinutes: 700, actualMinutes: 120 },
      { code: "408", name: "计算机学科专业基础", plannedMinutes: 500, actualMinutes: 90 },
    ])
    expect(result.actualMinutes).toBe(210)
    expect(result.plannedMinutes).toBe(1355)
  })

  it("按订正日期统计新增错题，按稳定日期统计新稳定错题与考点", () => {
    const result = summary()
    expect(result.newMistakes).toBe(0)
    expect(result.newlyStableMistakes).toBe(1)
    expect(result.newlyStableTopics).toBe(1)
  })

  it("本周之前订正或稳定的记录不计入", () => {
    const [mistake] = file.data.mistakes
    const earlier = { ...mistake!, correctedOn: parseLocalDate("2030-02-01"), retests: [] }
    const result = summary([earlier])
    expect(result.newMistakes).toBe(0)
    expect(result.newlyStableMistakes).toBe(0)
  })

  it("不是周一时拒绝汇总", () => {
    expect(() =>
      getWeeklySummary({
        profile: file.data.profile,
        dayPlans: file.data.dayPlans,
        daily: file.data.daily,
        mistakes: file.data.mistakes,
        topics: publicTopics,
        progress: file.data.progress,
        weekStart: parseLocalDate("2030-03-05"),
      })
    ).toThrow("周一开始")
  })
})

describe("周复盘记录", () => {
  const existing = file.data.weekly[0]!

  it("同一周再写时替换，其他周保留", () => {
    const next = { ...existing, nextWeekAdjustment: "改写" }
    const weekly = upsertWeeklyReview([existing], next)
    expect(weekly).toEqual([next])
    const other = { ...existing, weekStart: parseLocalDate("2030-03-11") }
    expect(upsertWeeklyReview([existing], other)).toHaveLength(2)
  })

  it("按周一开始读取记录", () => {
    expect(getWeeklyReview([existing], weekStart)).toEqual(existing)
    expect(getWeeklyReview([existing], parseLocalDate("2030-03-11"))).toBeNull()
  })

  it("记录只保存周开始与下周调整", () => {
    const keys = Object.keys(existing as WeeklyReview).toSorted()
    expect(keys).toEqual(["nextWeekAdjustment", "weekStart"])
  })
})
