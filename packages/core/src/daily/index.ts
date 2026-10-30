import { upsertUniqueBy } from "../collections"
import type { LocalDate } from "../dates"
import type { DailyLog } from "../progress"

/** 每天最多一条每日记录：已有同一天的记录就替换并归并重复项，否则按日期追加；不改入参。 */
export function upsertDailyLog(daily: readonly DailyLog[], log: DailyLog): DailyLog[] {
  return upsertUniqueBy(daily, (item) => item.date, log)
}

/** 某一天的每日记录；没有返回 null。 */
export function getDailyLog(daily: readonly DailyLog[], date: LocalDate): DailyLog | null {
  return daily.find((item) => item.date === date) ?? null
}

/** 学习时长只来自每日记录：返回某天各科已记录的分钟，没有记录时为空。 */
export function getRecordedMinutes(daily: readonly DailyLog[], date: LocalDate): Record<string, number> {
  return { ...getDailyLog(daily, date)?.minutes }
}
