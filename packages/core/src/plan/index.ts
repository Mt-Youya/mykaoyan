import { addDays, weekdayOf } from "../dates/index"
import type { LocalDate } from "../dates/index"
import type { DayPlan, MinutesBySubject, StudyProfile } from "../progress/index"

/** 某天生效的计划：各科分钟与弹性时间。 */
export type DailyPlan = { minutes: MinutesBySubject; flexMin: number }

/** 阶段校验：结束不早于开始、按日期先后排列、互不重叠。合法返回 null，否则返回错误说明。 */
export function validatePhases(phases: StudyProfile["phases"]): string | null {
  let previous: StudyProfile["phases"][number] | null = null
  for (const phase of phases) {
    if (phase.end < phase.start) return `阶段「${phase.name}」的结束日期早于开始日期`
    if (previous && phase.start <= previous.end)
      return `阶段「${phase.name}」与「${previous.name}」重叠或未按日期先后排列`
    previous = phase
  }
  return null
}

/** 周六与周日按周末算，不处理法定调休。 */
export function isWeekend(date: LocalDate) {
  const weekday = weekdayOf(date)
  return weekday === 0 || weekday === 6
}

/** 计划总分钟：各科分钟之和加上弹性时间。 */
export function getPlanTotal(plan: DailyPlan) {
  return Object.values(plan.minutes).reduce((sum, minutes) => sum + minutes, 0) + plan.flexMin
}

/**
 * 某天的计划：按天覆盖优先；否则取所在阶段的工作日或周末分配；阶段外不安排分钟。
 * 没有档案也没有按天覆盖时返回 null，由页面提示先建立备考档案。
 */
export function getDayPlan(
  profile: StudyProfile | null,
  dayPlans: readonly DayPlan[],
  date: LocalDate
): DailyPlan | null {
  const override = dayPlans.find((plan) => plan.date === date)
  if (override) return { minutes: { ...override.minutes }, flexMin: override.flexMin }
  if (!profile) return null
  const phase = profile.phases.find((item) => item.start <= date && date <= item.end)
  if (!phase) return { minutes: {}, flexMin: 0 }
  const plan = isWeekend(date) ? phase.weekend : phase.weekday
  return { minutes: { ...plan.minutes }, flexMin: plan.flexMin }
}

/** 按天计划按日期唯一：已有同一天的记录就替换，否则追加；不改入参。 */
export function upsertDayPlan(dayPlans: readonly DayPlan[], plan: DayPlan): DayPlan[] {
  if (!dayPlans.some((item) => item.date === plan.date)) return [...dayPlans, plan]
  return dayPlans.map((item) => (item.date === plan.date ? plan : item))
}

/** 本周从周一开始的七天日期。 */
export function getWeekDays(weekStart: LocalDate): LocalDate[] {
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => addDays(weekStart, offset))
}
