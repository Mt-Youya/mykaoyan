import { upsertUniqueBy } from "../collections"
import { addDays, weekdayOf } from "../dates/index"
import type { LocalDate } from "../dates/index"
import type { DayPlan, MinutesBySubject, StudyProfile } from "../progress/index"

/** 某天生效的计划：各科分钟与弹性时间。 */
export type DailyPlan = { minutes: MinutesBySubject; flexMin: number }

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
 * 某天的计划：按天覆盖优先；否则取所在阶段的工作日或周末分配。
 * 阶段外日期不安排分钟，与没有档案一样返回 null，由页面提示。
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
  if (!phase) return null
  const plan = isWeekend(date) ? phase.weekend : phase.weekday
  return { minutes: { ...plan.minutes }, flexMin: plan.flexMin }
}

/** 按天计划按日期唯一：同一天替换并归并重复项，否则追加；不改入参。 */
export function upsertDayPlan(dayPlans: readonly DayPlan[], plan: DayPlan): DayPlan[] {
  return upsertUniqueBy(dayPlans, (item) => item.date, plan)
}

/** 本周从周一开始的七天日期。 */
export function getWeekDays(weekStart: LocalDate): LocalDate[] {
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => addDays(weekStart, offset))
}
