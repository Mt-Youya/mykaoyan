import { describe, expect, it } from "vitest"
import { parseLocalDate } from "../dates/index"
import { progressFileSchema } from "../progress/index"
import { fullProgressFileFixture } from "../progress/fixtures/index"
import { getDailyLog, getRecordedMinutes, upsertDailyLog } from "./index"

const file = progressFileSchema.parse(fullProgressFileFixture.value)
const existing = file.data.daily[0]!

describe("每日记录", () => {
  it("每天最多一条：同一天再写时替换原记录", () => {
    const next = { ...existing, minutes: { "302": 60 }, retro: "改写" }
    const daily = upsertDailyLog([existing], next)
    expect(daily).toHaveLength(1)
    expect(daily[0]).toEqual(next)
  })

  it("补录新日期时追加，不修改原数组", () => {
    const original = [existing]
    const next = { ...existing, date: parseLocalDate("2030-03-11") }
    const daily = upsertDailyLog(original, next)
    expect(daily).toHaveLength(2)
    expect(original).toHaveLength(1)
    expect(daily.at(-1)?.date).toBe("2030-03-11")
  })

  it("按日期读取记录；学习时长只来自每日记录", () => {
    expect(getDailyLog([existing], parseLocalDate("2030-03-10"))?.minutes).toEqual({ "302": 120, "408": 90 })
    expect(getDailyLog([existing], parseLocalDate("2030-03-11"))).toBeNull()
    expect(getRecordedMinutes([existing], parseLocalDate("2030-03-10"))).toEqual({ "302": 120, "408": 90 })
    expect(getRecordedMinutes([existing], parseLocalDate("2030-03-11"))).toEqual({})
  })
})
