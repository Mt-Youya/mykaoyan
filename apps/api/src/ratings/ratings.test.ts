import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { beforeAll, afterAll, describe, it, expect } from "vitest"
import { createApp } from "../app"
import { readEnvironment } from "../environment"
import { MemorySmsVerifier, SMS_VERIFIER, PRIVACY_POLICY_VERSION } from "../auth"
type Body = {
  stars: number | null
  isOwn: boolean
  items: { id: string; ratingCount: number; weightedScore: number; recommended: boolean }[]
  enabled: boolean
}
type TestResponse = Omit<Response, "json"> & { json(): Promise<Body> }
describe("评分权限、修改与推荐 HTTP", () => {
  let app: Awaited<ReturnType<typeof createApp>>,
    off: Awaited<ReturnType<typeof createApp>>,
    origin: string,
    offOrigin: string,
    sql: ReturnType<typeof postgres>
  let admin: { id: string; cookie: string }, a: { id: string; cookie: string }, b: { id: string; cookie: string }
  const ids = { normal: randomUUID(), own: randomUUID(), hidden: randomUUID(), pending: randomUUID() }
  const call = (
    path: string,
    cookie?: string,
    body?: unknown,
    method = body === undefined ? "GET" : "PUT",
    base = origin
  ) =>
    fetch(`${base}/api/${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }) as Promise<TestResponse>
  const vote = (id: string, cookie?: string, stars: unknown = 5, base = origin) =>
    call(`submissions/${id}/rating`, cookie, { stars }, "PUT", base)
  async function login(phone: string) {
    expect((await call("phone/request-code", undefined, { phone }, "POST")).status).toBe(200)
    const r = await call(
      "phone/verify",
      undefined,
      {
        phone,
        code: (app.get(SMS_VERIFIER) as MemorySmsVerifier).peekCode(`+86${phone}`),
        acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
        acceptedTermsVersion: "2026-10-30",
      },
      "POST"
    )
    expect(r.status).toBe(200)
    const cookie = r.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .find((s) => s?.startsWith("better-auth.session_token="))!
    const [row] = await sql<{ id: string }[]>`select id from accounts where phone=${`+86${phone}`}`
    return { id: row!.id, cookie }
  }
  async function post(
    id: string,
    owner: string,
    subject = "302",
    topic: string | null = "M01",
    listed = true,
    status = "approved"
  ) {
    await sql`insert into submissions(id,account_id,title,summary,subject_code,topic_id,size,duration,fingerprint,object_key,status,listed,reviewed_at,reviewer_id) values(${id},${owner},'虚构评分投稿','',${subject},${topic},100,10,${"a".repeat(64)},${`submissions/fictional-rating-${id}/video.mp4`},${status},${listed},${status === "approved" ? new Date().toISOString() : null},${admin.id})`
  }
  async function grant(id: string) {
    expect(
      (await call("admin/membership/grants", admin.cookie, { accountId: id, reason: "虚构评分开通" }, "POST")).status
    ).toBe(201)
  }
  beforeAll(async () => {
    const config = readEnvironment({
      ...process.env,
      NODE_ENV: "test",
      PORT: "3001",
      COMMUNITY_ENABLED: "true",
      MEDIA_SIGNING_KEY: "fictional-rating-signing-key-32-characters",
    })
    const url = new URL(config.DATABASE_URL!)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test")
      throw new Error("只允许专用本机临时库")
    sql = postgres(url.href, { ssl: false, prepare: false })
    app = await createApp(config)
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
    off = await createApp({ ...config, COMMUNITY_ENABLED: false })
    await off.listen(0, "127.0.0.1")
    offOrigin = await off.getUrl()
    admin = await login("18800002301")
    a = await login("18800002302")
    b = await login("18800002303")
    await sql`update accounts set role='admin' where id=${admin.id}`
    await post(ids.normal, admin.id)
    await post(ids.own, a.id)
    await post(ids.hidden, admin.id, "302", "M01", false)
    await post(ids.pending, admin.id, "302", "M01", false, "pending")
  })
  afterAll(async () => {
    await off?.close()
    await app?.close()
    await sql?.end({ timeout: 1 })
  })
  it("未登录401、非会员403；开通后仍不能给自己或未上架投稿评分", async () => {
    expect((await vote(ids.normal)).status).toBe(401)
    expect((await vote(ids.normal, a.cookie)).status).toBe(403)
    await grant(a.id)
    expect((await vote(ids.own, admin.cookie)).status).toBe(403)
    await grant(admin.id)
    expect((await vote(ids.own, admin.cookie, 3)).status).toBe(200)
    expect((await vote(ids.normal, admin.cookie)).status).toBe(403)
    expect((await vote(ids.own, a.cookie)).status).toBe(403)
    expect((await vote(ids.hidden, a.cookie)).status).toBe(404)
    expect((await vote(ids.pending, a.cookie)).status).toBe(404)
    expect((await call(`submissions/${ids.normal}/rating`)).status).toBe(401)
  })
  it("每人每投稿一票且可修改，并发更新不重复计数；只读本人评分", async () => {
    expect((await vote(ids.normal, a.cookie, 1)).status).toBe(200)
    expect(await (await call(`submissions/${ids.normal}/rating`, a.cookie)).json()).toMatchObject({
      stars: 1,
      isOwn: false,
    })
    expect((await vote(ids.normal, a.cookie, 5)).status).toBe(200)
    expect(await (await call(`submissions/${ids.normal}/rating`, b.cookie)).json()).toMatchObject({ stars: null })
    const concurrent = await Promise.all([vote(ids.normal, a.cookie, 2), vote(ids.normal, a.cookie, 4)])
    expect(concurrent.map((r) => r.status)).toEqual([200, 200])
    const own = await (await call(`submissions/${ids.normal}/rating`, a.cookie)).json()
    expect([2, 4]).toContain(own.stars)
    expect(await (await call(`submissions/${ids.own}/rating`, a.cookie)).json()).toMatchObject({
      stars: null,
      isOwn: true,
    })
    const list = await (await call("submissions?subject=302")).json()
    expect(list.items.find((r) => r.id === ids.normal)?.ratingCount).toBe(1)
  })
  it("拒绝非法星数、伪造身份和手动推荐；社区开关同时限制评分读写", async () => {
    for (const stars of [0, 6, 1.5, "5"]) expect((await vote(ids.normal, a.cookie, stars)).status).toBe(400)
    for (const extra of [{ accountId: b.id }, { recommended: true }])
      expect((await call(`submissions/${ids.normal}/rating`, a.cookie, { stars: 5, ...extra })).status).toBe(400)
    expect((await vote(ids.normal, a.cookie, 5, offOrigin)).status).toBe(403)
    expect((await call(`submissions/${ids.normal}/rating`, a.cookie, undefined, "GET", offOrigin)).status).toBe(403)
    expect(await (await call("submissions?subject=302", undefined, undefined, "GET", offOrigin)).json()).toMatchObject({
      enabled: false,
      items: [],
    })
  })
  it("排序、推荐和筛选共用全站已上架评分基准；下架评分不计入基准", async () => {
    await sql`delete from submission_ratings where submission_id in ${sql(Object.values(ids))}`
    const good = randomUUID(),
      few = randomUUID(),
      low = randomUUID(),
      cross = randomUUID(),
      hidden = randomUUID()
    await post(good, admin.id)
    await post(few, admin.id)
    await post(low, admin.id, "302", "M02")
    await post(cross, admin.id, "408", "D01")
    await post(hidden, admin.id, "302", "M01", false)
    const voters: string[] = []
    for (let n = 0; n < 10; n++) {
      const id = randomUUID()
      voters.push(id)
      await sql`insert into accounts(id,name,email) values(${id},'虚构评分考生',${`${id}@example.invalid`})`
    }
    for (const [id, count, stars] of [
      [good, 5, 5],
      [few, 1, 5],
      [low, 10, 1],
      [cross, 4, 2],
      [hidden, 10, 5],
    ] as const)
      for (const voter of voters.slice(0, count))
        await sql`insert into submission_ratings(submission_id,account_id,stars) values(${id},${voter},${stars})`
    const list = await (await call("submissions?subject=302")).json()
    expect(list.items.filter((r) => [good, few, low].some((id) => id === r.id)).map((r) => r.id)).toEqual([
      good,
      few,
      low,
    ])
    const goodRow = list.items.find((r) => r.id === good)!
    expect(goodRow).toMatchObject({ ratingCount: 5, recommended: false })
    expect(goodRow.weightedScore).toBeCloseTo(49 / 15, 12)
    const topic = await (await call("submissions?subject=302&topic=M01")).json()
    expect(topic.items.some((r) => r.id === low || r.id === cross || r.id === hidden)).toBe(false)
    expect(topic.items.find((r) => r.id === good)?.weightedScore).toBe(goodRow.weightedScore)
    expect((await call("submissions?subject=302&topic=D01")).status).toBe(400)
    expect((await call("submissions?subject=302&page=-1")).status).toBe(400)
    await call(`admin/submissions/${low}/listing`, admin.cookie, { listed: false })
    await call(`admin/submissions/${cross}/listing`, admin.cookie, { listed: false })
    const recommended = await (await call("submissions?subject=302&topic=M01")).json()
    expect(recommended.items.find((r) => r.id === good)).toMatchObject({
      ratingCount: 5,
      weightedScore: 5,
      recommended: true,
    })
    expect(recommended.items.find((r) => r.id === few)).toMatchObject({
      ratingCount: 1,
      weightedScore: 5,
      recommended: false,
    })
    expect(recommended.items.findIndex((r) => r.id === good)).toBeLessThan(
      recommended.items.findIndex((r) => r.id === few)
    )
  })
  it("会员到期后不能修改评分，历史评分及人数保留", async () => {
    expect((await vote(ids.normal, a.cookie, 4)).status).toBe(200)
    await sql`update membership_periods set starts_at='2020-01-01',ends_at='2020-12-31' where account_id=${a.id}`
    expect((await vote(ids.normal, a.cookie, 5)).status).toBe(403)
    expect(await (await call(`submissions/${ids.normal}/rating`, a.cookie)).json()).toMatchObject({ stars: 4 })
    expect((await (await call("submissions?subject=302")).json()).items.find((r) => r.id === ids.normal)).toMatchObject(
      { ratingCount: 1 }
    )
  })
})
