import { z } from "zod"
export const membershipPeriodSchema = z
  .strictObject({ startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }) })
  .refine((p) => Date.parse(p.endsAt) > Date.parse(p.startsAt))
export type MembershipPeriod = z.infer<typeof membershipPeriodSchema>
const YEAR_MS = 365 * 24 * 60 * 60 * 1000
/** 左闭右开，连续的未来会员期合并展示到期时刻。 */
export function membershipStatus(
  periods: readonly MembershipPeriod[],
  now: number,
): { active: boolean; expiresAt: string | null } {
  z.number().finite().parse(now)
  const ordered = periods
    .map((p) => membershipPeriodSchema.parse(p))
    .toSorted((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  let end = now
  for (const period of ordered) {
    if (Date.parse(period.startsAt) <= end && Date.parse(period.endsAt) > end) end = Date.parse(period.endsAt)
  }
  return { active: end > now, expiresAt: end > now ? new Date(end).toISOString() : null }
}
export function nextMembershipPeriod(periods: readonly MembershipPeriod[], now: number): MembershipPeriod {
  const current = membershipStatus(periods, now)
  const start = current.expiresAt ? Date.parse(current.expiresAt) : now
  return membershipPeriodSchema.parse({
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + YEAR_MS).toISOString(),
  })
}
