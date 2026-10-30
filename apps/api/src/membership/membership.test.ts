import postgres from "postgres"
import { beforeAll, afterAll, describe, it, expect } from "vitest"
import { createApp } from "../app"
import { MemorySmsVerifier, PRIVACY_POLICY_VERSION, SMS_VERIFIER } from "../auth"
import { readEnvironment } from "../environment"
import { MembershipService } from "./service"
describe("会员期与兑换码 HTTP", () => {
  let app: Awaited<ReturnType<typeof createApp>>, sql: ReturnType<typeof postgres>, origin: string
  let admin: { cookie: string; id: string }, a: { cookie: string; id: string }, b: { cookie: string; id: string }
  async function login(phone: string) {
    const headers = { "content-type": "application/json" }
    const requested = await fetch(`${origin}/api/phone/request-code`, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone }),
    })
    expect(requested.status).toBe(200)
    const result = await fetch(`${origin}/api/phone/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone,
        code: (app.get(SMS_VERIFIER) as MemorySmsVerifier).peekCode(`+86${phone}`),
        acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
        acceptedTermsVersion: "2026-10-30",
      }),
    })
    expect(result.status).toBe(200)
    const cookie = result.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .find((v) => v?.startsWith("better-auth.session_token="))!
    const rows = await sql<{ id: string }[]>`select id from accounts where phone=${`+86${phone}`}`
    return { cookie, id: rows[0]!.id }
  }
  const request = (path: string, cookie?: string, body?: unknown) =>
    fetch(`${origin}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  beforeAll(async () => {
    const config = readEnvironment({
      ...process.env,
      NODE_ENV: "test",
      PORT: "3001",
      MEDIA_SIGNING_KEY: "fictional-membership-test-key-32-characters",
    })
    const url = new URL(config.DATABASE_URL!)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test")
      throw new Error("只允许本机专用临时库")
    sql = postgres(config.DATABASE_URL!, { ssl: false, prepare: false })
    app = await createApp(config)
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
    admin = await login("18800002001")
    a = await login("18800002002")
    b = await login("18800002003")
    await sql`delete from membership_periods where account_id in (${a.id},${b.id})`
    await sql`update accounts set role='admin' where id=${admin.id}`
  })
  afterAll(async () => {
    if (sql && admin) await sql`delete from redemption_codes where created_by=${admin.id}`
    await app?.close()
    await sql?.end({ timeout: 1 })
  })
  it("未登录401，普通账号403；管理员开通必须写原因，续期无重叠", async () => {
    expect((await request("membership")).status).toBe(401)
    expect((await request("admin/membership/codes", a.cookie)).status).toBe(403)
    expect((await request("admin/membership/accounts", a.cookie, { phone: "18800002002" })).status).toBe(403)
    expect(await (await request("admin/membership/accounts", admin.cookie, { phone: "18800002002" })).json()).toEqual({
      id: a.id,
    })
    await expect(app.get(MembershipService).generate({ id: a.id, role: "admin" }, { count: 1 })).rejects.toThrow()
    expect((await request("admin/membership/grants", a.cookie, { accountId: a.id, reason: "虚构原因" })).status).toBe(
      403
    )
    expect((await request("admin/membership/grants", admin.cookie, { accountId: a.id, reason: " " })).status).toBe(400)
    const first = await request("admin/membership/grants", admin.cookie, { accountId: a.id, reason: "虚构首次开通" })
    expect(first.status).toBe(201)
    const period = (await first.json()) as { startsAt: string; endsAt: string }
    expect(Date.parse(period.endsAt) - Date.parse(period.startsAt)).toBe(365 * 86400000)
    const second = await request("admin/membership/grants", admin.cookie, { accountId: a.id, reason: "虚构续期" })
    const extension = (await second.json()) as { startsAt: string; endsAt: string }
    expect(extension.startsAt).toBe(period.endsAt)
    expect(await (await request("membership", a.cookie)).json()).toMatchObject({
      active: true,
      expiresAt: extension.endsAt,
    })
    expect(await (await request(`membership?accountId=${a.id}`, b.cookie)).json()).toEqual({
      active: false,
      expiresAt: null,
    })
  })
  it("生成只显示一次明文，列表显示兑换账号；同一个码并发只能兑换一次", async () => {
    expect((await request("admin/membership/codes", admin.cookie, { count: 101 })).status).toBe(400)
    const generated = await request("admin/membership/codes", admin.cookie, { count: 2 })
    expect(generated.status).toBe(201)
    const { codes: records } = (await generated.json()) as { codes: { id: string; code: string }[] }
    const codes = records.map((v) => v.code)
    expect(codes).toHaveLength(2)
    const listed = await (await request("admin/membership/codes", admin.cookie)).text()
    for (const code of codes) expect(listed).not.toContain(code)
    const results = await Promise.all([
      request("membership/redeem", a.cookie, { code: codes[0] }),
      request("membership/redeem", b.cookie, { code: codes[0] }),
    ])
    expect(results.map((r) => r.status).toSorted()).toEqual([201, 409])
    const list = (await (await request("admin/membership/codes", admin.cookie)).json()) as {
      items: { id: string; last4: string; redeemedAt: string | null; redeemedBy: string | null }[]
    }
    const used = list.items.find((v) => v.id === records[0]!.id)!
    expect(used.redeemedAt).not.toBeNull()
    expect(used.redeemedBy).toBe(results[0]!.status === 201 ? a.id : b.id)
    expect((await request("membership/redeem", a.cookie, { code: codes[0] })).status).toBe(409)
    expect((await request("membership/redeem", b.cookie, { code: codes[1], accountId: a.id })).status).toBe(400)
    expect((await request("membership/redeem", b.cookie, { code: codes[1]!.toLowerCase() })).status).toBe(201)
  })
  it("同账号同时手动开通与兑换会串行叠加，过期会员重新开通从当前开始", async () => {
    await sql`delete from membership_periods where account_id=${b.id}`
    await sql`insert into membership_periods(account_id,starts_at,ends_at,source,reason) values(${b.id},'2020-01-01','2020-12-31','manual','虚构已过期期限')`
    const generated = (await (await request("admin/membership/codes", admin.cookie, { count: 1 })).json()) as {
      codes: { id: string; code: string }[]
    }
    const results = await Promise.all([
      request("admin/membership/grants", admin.cookie, { accountId: b.id, reason: "虚构并发开通" }),
      request("membership/redeem", b.cookie, { code: generated.codes[0]!.code }),
    ])
    expect(results.map((r) => r.status)).toEqual([201, 201])
    const periods = await Promise.all(
      results.map(async (r) => (await r.json()) as { startsAt: string; endsAt: string })
    )
    periods.sort((x, y) => x.startsAt.localeCompare(y.startsAt))
    expect(periods[1]!.startsAt).toBe(periods[0]!.endsAt)
    expect(Date.now() - Date.parse(periods[0]!.startsAt)).toBeLessThan(10000)
  })
})
