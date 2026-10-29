import { describe, expect, it } from "vitest"
import { parseLocalDate } from "../dates/index"
import { mistakeSchema, progressFileSchema } from "../progress/index"
import { fullProgressFileFixture } from "../progress/fixtures/index"
import type { RetestAttempt } from "../progress/index"
import { getDueRetests, getRetestState, recordRetest } from "./index"

const base = progressFileSchema.parse(fullProgressFileFixture.value).data.mistakes[0]!

function mistake(correctedOn: string, retests: RetestAttempt[]) {
  return { ...base, id: `mistake-${correctedOn}`, correctedOn: parseLocalDate(correctedOn), retests }
}

/** 规格表里的复测记录用普通日期字符串书写，进入函数前才转成本地日期。 */
function attempts(rows: readonly { on: string; result: RetestAttempt["result"] }[]): RetestAttempt[] {
  return rows.map((row) => ({ on: parseLocalDate(row.on), result: row.result }))
}

/** PLAN §5.6 的规则；期望值由规格手写，不复用实现里的推算方式。 */
const scenarios = [
  {
    name: "首次：订正后第 2 天复测，未到期不逾期",
    correctedOn: "2030-03-01",
    retests: [],
    today: "2030-03-01",
    expected: { stable: false, attempt: 1, nextOn: "2030-03-03", overdueDays: 0 },
  },
  {
    name: "首次：到期当天不算逾期",
    correctedOn: "2030-03-01",
    retests: [],
    today: "2030-03-03",
    expected: { stable: false, attempt: 1, nextOn: "2030-03-03", overdueDays: 0 },
  },
  {
    name: "独立完成两次后稳定",
    correctedOn: "2030-03-01",
    retests: [
      { on: "2030-03-03", result: "independent" },
      { on: "2030-03-08", result: "independent" },
    ],
    today: "2030-03-10",
    expected: { stable: true },
  },
  {
    name: "提示后完成：基准日变成该次复测日，从第一次复测重新开始",
    correctedOn: "2030-03-01",
    retests: [{ on: "2030-03-03", result: "with-hint" }],
    today: "2030-03-04",
    expected: { stable: false, attempt: 1, nextOn: "2030-03-05", overdueDays: 0 },
  },
  {
    name: "不会：同样按该次复测日重置，从第一次复测重新开始",
    correctedOn: "2030-03-01",
    retests: [{ on: "2030-03-03", result: "failed" }],
    today: "2030-03-06",
    expected: { stable: false, attempt: 1, nextOn: "2030-03-05", overdueDays: 1 },
  },
  {
    name: "第二次独立完成前失败：回到第一次复测",
    correctedOn: "2030-03-01",
    retests: [
      { on: "2030-03-03", result: "independent" },
      { on: "2030-03-08", result: "failed" },
    ],
    today: "2030-03-09",
    expected: { stable: false, attempt: 1, nextOn: "2030-03-10", overdueDays: 0 },
  },
  {
    name: "逾期：显示逾期天数，继续等待作答，不判失败",
    correctedOn: "2030-03-01",
    retests: [],
    today: "2030-03-06",
    expected: { stable: false, attempt: 1, nextOn: "2030-03-03", overdueDays: 3 },
  },
  {
    name: "补录过去的日期：按补录的复测记录推算第二次复测",
    correctedOn: "2030-03-01",
    retests: [{ on: "2030-03-03", result: "independent" }],
    today: "2030-03-10",
    expected: { stable: false, attempt: 2, nextOn: "2030-03-08", overdueDays: 2 },
  },
] as const

describe("错题复测推算（PLAN §5.6）", () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      expect(
        getRetestState(mistake(scenario.correctedOn, attempts(scenario.retests)), parseLocalDate(scenario.today))
      ).toEqual(scenario.expected)
    })
  }

  it("稳定状态由两次独立完成推算，记录里不存稳定标记", () => {
    const stable = mistake(
      "2030-03-01",
      attempts([
        { on: "2030-03-03", result: "independent" },
        { on: "2030-03-08", result: "independent" },
      ])
    )
    expect(getRetestState(stable, parseLocalDate("2030-03-10"))).toEqual({ stable: true })
  })
})

describe("到期复测排序", () => {
  it("只返回到期或逾期的未稳定错题，逾期最久在前", () => {
    const today = parseLocalDate("2030-03-10")
    const stable = {
      ...mistake("2030-03-01", []),
      id: "stable",
      retests: attempts([
        { on: "2030-03-03", result: "independent" },
        { on: "2030-03-08", result: "independent" },
      ]),
    }
    const dueToday = { ...mistake("2030-03-08", []), id: "due-today" }
    const overdue = { ...mistake("2030-03-02", []), id: "overdue" }
    const future = { ...mistake("2030-03-10", []), id: "future" }

    expect(getDueRetests([future, dueToday, stable, overdue], today).map((item) => item.mistake.id)).toEqual([
      "overdue",
      "due-today",
    ])
  })
})

describe("追加复测记录", () => {
  it("允许补录过去日期，但不得早于上一次复测", () => {
    const empty = mistake("2030-03-01", [])
    const backfilled = recordRetest(empty, "independent", parseLocalDate("2030-03-02"))
    expect(backfilled.retests).toEqual([{ on: "2030-03-02", result: "independent" }])
    expect(() => recordRetest(backfilled, "failed", parseLocalDate("2030-03-01"))).toThrow("不能早于")
  })

  it("拒绝非法日期", () => {
    expect(() => recordRetest(mistake("2030-03-01", []), "independent", parseLocalDate("2030-02-30"))).toThrow()
  })
})

describe("复测派生字段不落库", () => {
  it("错题记录拒绝稳定标记、下次复测日期、第几次和逾期天数", () => {
    const derived = { ...mistake("2030-03-01", []), stable: false, nextOn: "2030-03-03", attempt: 1, overdueDays: 2 }
    expect(mistakeSchema.safeParse(derived).success).toBe(false)
  })

  it("复测记录只保存日期与结果，拒绝随推算产生的逾期天数", () => {
    const retest = { on: "2030-03-03", result: "independent", overdueDays: 1 }
    expect(mistakeSchema.safeParse({ ...mistake("2030-03-01", []), retests: [retest] }).success).toBe(false)
  })
})

describe("错题随进度文件往返", () => {
  it("序列化再解析后错题数据逐字段相等", () => {
    const file = progressFileSchema.parse(fullProgressFileFixture.value)
    const roundTripped = progressFileSchema.parse(JSON.parse(JSON.stringify(file)))
    expect(roundTripped).toEqual(file)
    expect(roundTripped.data.mistakes).toEqual(file.data.mistakes)
  })
})
