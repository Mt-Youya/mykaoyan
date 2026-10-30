import { describe, expect, it } from "vitest"

import { membershipStatus, nextMembershipPeriod } from "."
const now = Date.parse("2030-01-01T00:00:00Z")
describe("会员期固定365天与叠加", () => {
  it("非会员从开通时开始，跨年仍为365天", () => {
    const period = nextMembershipPeriod([], now)
    expect(period).toEqual({ startsAt: "2030-01-01T00:00:00.000Z", endsAt: "2031-01-01T00:00:00.000Z" })
    expect(nextMembershipPeriod([], Date.parse("2024-01-01T00:00:00Z")).endsAt).toBe("2024-12-31T00:00:00.000Z")
  })
  it("未过期续期接在全部连续会员期后，过期后重新开始", () => {
    const first = nextMembershipPeriod([], now),
      second = nextMembershipPeriod([first], now + 1000)
    expect(second.startsAt).toBe(first.endsAt)
    expect(membershipStatus([second, first], now)).toEqual({ active: true, expiresAt: second.endsAt })
    expect(membershipStatus([first], Date.parse(first.endsAt))).toEqual({ active: false, expiresAt: null })
    const expired = nextMembershipPeriod([first], Date.parse("2032-01-01T00:00:00Z"))
    expect(expired.startsAt).toBe("2032-01-01T00:00:00.000Z")
  })
  it("未开始的会员期不会提前生效，空档不会算成有效期", () => {
    expect(membershipStatus([{ startsAt: "2030-02-01T00:00:00Z", endsAt: "2031-02-01T00:00:00Z" }], now).active).toBe(
      false,
    )
  })
})
