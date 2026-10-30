import { addDays, weekdayOf } from "../dates/index"
import type { LocalDate } from "../dates/index"
import { getStableOn } from "../mistakes/index"
import { getDayPlan, getPlanTotal, getWeekDays } from "../plan/index"
import type { DailyLog, DayPlan, Mistake, StudyProfile, TopicProgress, WeeklyReview } from "../progress/index"
import { getTopicStableOn } from "../topics/index"
import type { Topic } from "../topics/index"

export type WeeklySubjectSummary = {
  code: string
  name: string
  plannedMinutes: number
  actualMinutes: number
}

export type WeeklySummary = {
  weekStart: LocalDate
  days: readonly LocalDate[]
  subjects: readonly WeeklySubjectSummary[]
  plannedMinutes: number
  actualMinutes: number
  newMistakes: number
  newlyStableMistakes: number
  newlyStableTopics: number
}

/** 一周从周一开始：返回该日期所在周的周一。 */
export function startOfWeek(date: LocalDate): LocalDate {
  const weekday = weekdayOf(date)
  return addDays(date, -(weekday === 0 ? 6 : weekday - 1))
}

export type WeeklySummaryInput = {
  profile: StudyProfile | null
  dayPlans: readonly DayPlan[]
  daily: readonly DailyLog[]
  mistakes: readonly Mistake[]
  topics: readonly Topic[]
  progress: readonly TopicProgress[]
  weekStart: LocalDate
}

/**
 * 周复盘汇总（PLAN §5.8）：只读统计，不写状态。
 * 各科学习时长来自每日记录；计划分钟来自当日生效的计划；新增错题按订正日期、新稳定按稳定日期归入本周。
 */
export function getWeeklySummary(input: WeeklySummaryInput): WeeklySummary {
  if (weekdayOf(input.weekStart) !== 1) throw new Error("周复盘必须从周一开始")
  const days = getWeekDays(input.weekStart)
  const weekEnd = days[6]!
  const inWeek = (date: LocalDate) => date >= input.weekStart && date <= weekEnd

  const subjects = (input.profile?.subjects ?? []).map((subject) => ({
    code: subject.code,
    name: subject.name,
    plannedMinutes: days.reduce(
      (sum, day) => sum + (getDayPlan(input.profile, input.dayPlans, day)?.minutes[subject.code] ?? 0),
      0,
    ),
    actualMinutes: input.daily
      .filter((log) => inWeek(log.date))
      .reduce((sum, log) => sum + (log.minutes[subject.code] ?? 0), 0),
  }))

  return {
    weekStart: input.weekStart,
    days,
    subjects,
    plannedMinutes: days.reduce((sum, day) => {
      const plan = getDayPlan(input.profile, input.dayPlans, day)
      return sum + (plan ? getPlanTotal(plan) : 0)
    }, 0),
    actualMinutes: input.daily
      .filter((log) => inWeek(log.date))
      .reduce((sum, log) => sum + Object.values(log.minutes).reduce((daySum, minutes) => daySum + minutes, 0), 0),
    newMistakes: input.mistakes.filter((mistake) => inWeek(mistake.correctedOn)).length,
    newlyStableMistakes: input.mistakes.filter((mistake) => {
      const stableOn = getStableOn(mistake)
      return stableOn !== null && inWeek(stableOn)
    }).length,
    newlyStableTopics: input.topics.filter((topic) => {
      const manual = input.progress.find((item) => item.topicId === topic.id)?.manual ?? "untested"
      if (manual !== "practiced") return false
      const stableOn = getTopicStableOn(topic.id, input.mistakes)
      return stableOn !== null && inWeek(stableOn)
    }).length,
  }
}

/** 周复盘记录按周一唯一：已有同一周的记录就替换，否则追加；不改入参。 */
export function upsertWeeklyReview(weekly: readonly WeeklyReview[], review: WeeklyReview): WeeklyReview[] {
  if (!weekly.some((item) => item.weekStart === review.weekStart)) return [...weekly, review]
  return weekly.map((item) => (item.weekStart === review.weekStart ? review : item))
}

/** 某一周的周复盘记录；没有返回 null。 */
export function getWeeklyReview(weekly: readonly WeeklyReview[], weekStart: LocalDate): WeeklyReview | null {
  return weekly.find((item) => item.weekStart === weekStart) ?? null
}
