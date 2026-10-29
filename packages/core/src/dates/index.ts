import { z } from "zod"

export const localDateSchema = z.iso.date().brand<"LocalDate">()
export type LocalDate = z.infer<typeof localDateSchema>

export function parseLocalDate(value: string): LocalDate {
  return localDateSchema.parse(value)
}

const shanghaiDate = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

export function toLocalDate(instant: Date): LocalDate {
  const parts = shanghaiDate.formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value
  return parseLocalDate(`${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`)
}

export function addDays(date: LocalDate, days: number): LocalDate {
  z.number().int().parse(days)
  const instant = new Date(`${date}T00:00:00.000Z`)
  instant.setUTCDate(instant.getUTCDate() + days)
  return parseLocalDate(instant.toISOString().substring(0, 10))
}

/** 星期：周日 0、周一 1……周六 6；不处理法定调休。 */
export function weekdayOf(date: LocalDate): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  localDateSchema.parse(date)
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6
}
