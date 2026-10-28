import { describe, expect, it } from "vitest"
import { addDays, parseLocalDate, toLocalDate } from "../index"

describe("LocalDate", () => {
  it.each([
    ["2026-10-26T15:59:59.999Z", "2026-10-26"],
    ["2026-10-26T16:00:00.000Z", "2026-10-27"],
    ["2024-02-28T16:00:00.000Z", "2024-02-29"],
    ["2024-02-29T16:00:00.000Z", "2024-03-01"],
    ["2026-12-31T16:00:00.000Z", "2027-01-01"],
  ])("把时刻 %s 换算为上海日期 %s", (instant, expected) => {
    expect(toLocalDate(new Date(instant))).toBe(expected)
  })

  it.each(["2025-02-29", "2026-04-31", "2026-1-01", "2026-10-26T00:00:00Z", ""])("拒绝非法日期 %s", (value) =>
    expect(() => parseLocalDate(value)).toThrow()
  )

  it.each([
    ["2024-02-28", 1, "2024-02-29"],
    ["2024-02-29", 1, "2024-03-01"],
    ["2025-02-28", 1, "2025-03-01"],
    ["2026-12-31", 2, "2027-01-02"],
    ["2026-03-01", -1, "2026-02-28"],
  ])("%s 加 %i 天得到 %s", (date, days, expected) => {
    expect(addDays(parseLocalDate(date), days)).toBe(expected)
  })

  it("拒绝非法时刻和非整数天数", () => {
    expect(() => toLocalDate(new Date(Number.NaN))).toThrow()
    expect(() => addDays(parseLocalDate("2026-10-26"), 0.5)).toThrow()
  })
})
