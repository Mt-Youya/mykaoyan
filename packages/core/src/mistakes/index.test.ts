import { describe, expect, it } from "vitest"
import { parseLocalDate } from "../dates/index"
import { progressFileSchema } from "../progress/index"
import { fullProgressFileFixture } from "../progress/fixtures/index"
import { getDueRetests, getRetestState, recordRetest } from "./index"

const source = progressFileSchema.parse(fullProgressFileFixture.value).data.mistakes[0]!

describe("错题复测", () => {
  it("两次独立完成后稳定，失败或提示后完成从第一次复测重新开始", () => {
    expect(getRetestState(source, parseLocalDate("2030-03-10"))).toEqual({ stable: true })
    const reset = recordRetest(
      { ...source, retests: [{ on: parseLocalDate("2030-03-03"), result: "with-hint" }] },
      "failed",
      parseLocalDate("2030-03-03")
    )
    expect(getRetestState(reset, parseLocalDate("2030-03-05"))).toEqual({
      stable: false,
      attempt: 1,
      nextOn: "2030-03-05",
      overdueDays: 0,
    })
  })

  it("逾期复测排在今天到期项前，并拒绝倒序写入", () => {
    const overdue = { ...source, id: "overdue", retests: [] }
    const today = { ...source, id: "today", correctedOn: parseLocalDate("2030-03-08"), retests: [] }
    expect(getDueRetests([today, overdue], parseLocalDate("2030-03-10")).map((item) => item.mistake.id)).toEqual([
      "overdue",
      "today",
    ])
    expect(() => recordRetest(source, "independent", parseLocalDate("2030-03-07"))).toThrow("不能早于")
  })
})
