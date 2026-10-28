import { addDays, localDateSchema } from "../dates/index"
import type { LocalDate } from "../dates/index"
import type { Mistake, RetestResult } from "../progress/index"

export type RetestState = { stable: true } | { stable: false; attempt: 1 | 2; nextOn: LocalDate; overdueDays: number }

export type DueRetest = { mistake: Mistake; state: Extract<RetestState, { stable: false }> }

function daysBetween(from: LocalDate, to: LocalDate) {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000)
}

/** 从订正和原始复测记录推算下一次复测；稳定状态绝不落库。 */
export function getRetestState(mistake: Mistake, today: LocalDate): RetestState {
  let attempt: 1 | 2 = 1
  let nextOn = addDays(mistake.correctedOn, 2)
  for (const retest of mistake.retests) {
    if (retest.result === "independent" && attempt === 2) return { stable: true }
    if (retest.result === "independent") {
      attempt = 2
      nextOn = addDays(retest.on, 5)
    } else {
      attempt = 1
      nextOn = addDays(retest.on, 2)
    }
  }
  return { stable: false, attempt, nextOn, overdueDays: Math.max(0, daysBetween(nextOn, today)) }
}

/** 只返回到期或逾期复测；逾期最久的排在今天到期之前。 */
export function getDueRetests(mistakes: readonly Mistake[], today: LocalDate): DueRetest[] {
  return mistakes
    .map((mistake) => ({ mistake, state: getRetestState(mistake, today) }))
    .filter((item): item is DueRetest => !item.state.stable && item.state.nextOn <= today)
    .toSorted(
      (left, right) =>
        right.state.overdueDays - left.state.overdueDays || left.state.nextOn.localeCompare(right.state.nextOn)
    )
}

/** 追加一次复测原始记录；晚于上次记录才允许写入，计划状态仍由 getRetestState 推算。 */
export function recordRetest(mistake: Mistake, result: RetestResult, on: LocalDate): Mistake {
  localDateSchema.parse(on)
  const previous = mistake.retests.at(-1)
  if (previous && on < previous.on) throw new Error("复测日期不能早于上一次复测")
  return { ...mistake, retests: [...mistake.retests, { on, result }] }
}
