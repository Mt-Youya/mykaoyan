import { addDays, localDateSchema } from "../dates/index"
import type { LocalDate } from "../dates/index"
import type { Mistake, RetestAttempt, RetestResult } from "../progress/index"

export type RetestState = { stable: true } | { stable: false; attempt: 1 | 2; nextOn: LocalDate; overdueDays: number }

export type DueRetest = { mistake: Mistake; state: Extract<RetestState, { stable: false }> }

function daysBetween(from: LocalDate, to: LocalDate) {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000)
}

/** 复测记录按日期先后排列；同一天的记录保持写入顺序（toSorted 稳定排序）。 */
function byDate(left: RetestAttempt, right: RetestAttempt) {
  return left.on.localeCompare(right.on)
}

/** 推算出的复测进度：稳定时带稳定日期，未稳定时带下一次日期。 */
type RetestProgress = { stable: true; stableOn: LocalDate } | { stable: false; attempt: 1 | 2; nextOn: LocalDate }

/** 从订正和原始复测记录推算复测进度；推算只依赖复测的日期先后，乱序记录也不能算错。 */
function foldRetests(mistake: Mistake): RetestProgress {
  let attempt: 1 | 2 = 1
  let nextOn = addDays(mistake.correctedOn, 2)
  for (const retest of mistake.retests.toSorted(byDate)) {
    if (retest.result === "independent" && attempt === 2) return { stable: true, stableOn: retest.on }
    if (retest.result === "independent") {
      attempt = 2
      nextOn = addDays(retest.on, 5)
    } else {
      attempt = 1
      nextOn = addDays(retest.on, 2)
    }
  }
  return { stable: false, attempt, nextOn }
}

/** 从订正和原始复测记录推算下一次复测；稳定状态绝不落库。 */
export function getRetestState(mistake: Mistake, today: LocalDate): RetestState {
  const progress = foldRetests(mistake)
  if (progress.stable) return { stable: true }
  return {
    stable: false,
    attempt: progress.attempt,
    nextOn: progress.nextOn,
    overdueDays: Math.max(0, daysBetween(progress.nextOn, today)),
  }
}

/** 复测是否到期：未稳定且下次复测日期不晚于今天。 */
export function isRetestDue(state: RetestState, today: LocalDate) {
  return !state.stable && state.nextOn <= today
}

/** 错题是否稳定；稳定与查询日期无关。 */
export function isMistakeStable(mistake: Mistake) {
  return foldRetests(mistake).stable
}

/** 错题稳定的日期：第二次独立完成的复测日期；尚未稳定返回 null。 */
export function getStableOn(mistake: Mistake): LocalDate | null {
  const progress = foldRetests(mistake)
  return progress.stable ? progress.stableOn : null
}

/** 只返回到期或逾期复测；逾期最久的排在今天到期之前。 */
export function getDueRetests(mistakes: readonly Mistake[], today: LocalDate): DueRetest[] {
  return mistakes
    .map((mistake) => ({ mistake, state: getRetestState(mistake, today) }))
    .filter((item): item is DueRetest => isRetestDue(item.state, today))
    .toSorted(
      (left, right) =>
        right.state.overdueDays - left.state.overdueDays || left.state.nextOn.localeCompare(right.state.nextOn),
    )
}

/** 追加一次复测原始记录；稳定后不再追加，日期必须晚于已有的复测；计划状态仍由 getRetestState 推算。 */
export function recordRetest(mistake: Mistake, result: RetestResult, on: LocalDate): Mistake {
  localDateSchema.parse(on)
  if (isMistakeStable(mistake)) throw new Error("错题已稳定，不再追加复测")
  const latestOn = mistake.retests.toSorted(byDate).at(-1)?.on
  if (latestOn !== undefined && on <= latestOn) throw new Error("复测日期必须晚于已有的复测")
  return { ...mistake, retests: [...mistake.retests, { on, result }] }
}
