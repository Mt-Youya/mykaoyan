import { describe, expect, it } from "vitest"

import { getDayPlan, getPlanTotal, getWeekDays, isWeekend, upsertDayPlan } from "."
import { parseLocalDate } from "../dates"
import { progressFileSchema, validatePhases } from "../progress"
import { fullProgressFileFixture } from "../progress/fixtures"

const file = progressFileSchema.parse(fullProgressFileFixture.value)
const profile = file.data.profile!
const dayPlans = file.data.dayPlans

describe("默认计划推算", () => {
  it("阶段内工作日按工作日分配", () => {
    expect(getDayPlan(profile, [], parseLocalDate("2030-03-04"))).toEqual({
      minutes: { "302": 90, "408": 60 },
      flexMin: 20,
    })
  })

  it.each(["2030-03-09", "2030-03-10"])("周六、周日按周末分配：%s", (date) => {
    expect(getDayPlan(profile, [], parseLocalDate(date))).toEqual({
      minutes: { "302": 150, "408": 120 },
      flexMin: 30,
    })
  })

  it("阶段外不安排分钟", () => {
    expect(getDayPlan(profile, [], parseLocalDate("2030-07-01"))).toBeNull()
  })

  it("按天覆盖优先于阶段分配", () => {
    expect(getDayPlan(profile, dayPlans, parseLocalDate("2030-03-10"))).toEqual({
      minutes: { "302": 100, "408": 80 },
      flexMin: 25,
    })
  })

  it("没有档案且没有按天覆盖时返回 null，由页面提示建立档案", () => {
    expect(getDayPlan(null, [], parseLocalDate("2030-03-04"))).toBeNull()
  })

  it("按天计划是显式记录，即使没有档案也生效", () => {
    expect(getDayPlan(null, dayPlans, parseLocalDate("2030-03-10"))).toEqual({
      minutes: { "302": 100, "408": 80 },
      flexMin: 25,
    })
  })

  it("计划总分钟等于各科分钟之和加弹性时间", () => {
    expect(getPlanTotal({ minutes: { "302": 90, "408": 60 }, flexMin: 20 })).toBe(170)
    expect(getPlanTotal({ minutes: {}, flexMin: 0 })).toBe(0)
  })

  it("按天计划按日期唯一：同一天替换，新日期追加且不改入参", () => {
    const original = [{ date: parseLocalDate("2030-03-10"), minutes: { "302": 100 }, flexMin: 25 }]
    const replaced = upsertDayPlan(original, {
      date: parseLocalDate("2030-03-10"),
      minutes: { "302": 60 },
      flexMin: 5,
    })
    expect(replaced).toEqual([{ date: "2030-03-10", minutes: { "302": 60 }, flexMin: 5 }])
    expect(original[0]!.minutes).toEqual({ "302": 100 })
    expect(upsertDayPlan(original, { date: parseLocalDate("2030-03-11"), minutes: {}, flexMin: 0 })).toHaveLength(2)
  })
})

describe("阶段校验", () => {
  it("按日期先后且互不重叠时通过", () => {
    expect(validatePhases(profile.phases)).toBeNull()
    expect(validatePhases([])).toBeNull()
  })

  it("结束日期早于开始日期时报错", () => {
    const phases = [{ ...profile.phases[0]!, start: parseLocalDate("2030-05-01"), end: parseLocalDate("2030-04-01") }]
    expect(validatePhases(phases)).toContain("结束日期早于开始日期")
  })

  it("阶段重叠时报错，相邻阶段首尾相接不算重叠", () => {
    const [phase] = profile.phases
    const overlapping = [
      phase!,
      { ...phase!, name: "后一阶段", start: parseLocalDate("2030-06-30"), end: parseLocalDate("2030-08-01") },
    ]
    expect(validatePhases(overlapping)).toContain("重叠")
    const adjacent = [
      phase!,
      { ...phase!, name: "后一阶段", start: parseLocalDate("2030-07-01"), end: parseLocalDate("2030-08-01") },
    ]
    expect(validatePhases(adjacent)).toBeNull()
  })

  it("阶段未按日期先后排列时报错", () => {
    const [phase] = profile.phases
    const unsorted = [
      { ...phase!, name: "后一阶段", start: parseLocalDate("2030-07-01"), end: parseLocalDate("2030-08-01") },
      phase!,
    ]
    expect(validatePhases(unsorted)).toContain("重叠或未按日期先后排列")
  })
})

describe("周末与一周日期", () => {
  it.each([
    ["2030-03-04", false],
    ["2030-03-08", false],
    ["2030-03-09", true],
    ["2030-03-10", true],
  ])("%s 是否周末：%s", (date, expected) => {
    expect(isWeekend(parseLocalDate(date))).toBe(expected)
  })

  it("从周一开始生成七天", () => {
    expect(getWeekDays(parseLocalDate("2030-03-04"))).toEqual([
      "2030-03-04",
      "2030-03-05",
      "2030-03-06",
      "2030-03-07",
      "2030-03-08",
      "2030-03-09",
      "2030-03-10",
    ])
  })
})
