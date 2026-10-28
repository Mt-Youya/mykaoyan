import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../app"
import { MemorySmsVerifier, PRIVACY_POLICY_VERSION, SMS_VERIFIER } from "../auth"
import { readEnvironment } from "../environment"

const TEST_ENV = {
  ...process.env,
  NODE_ENV: "test",
  PORT: "3001",
  MEDIA_SIGNING_KEY: "test-media-signing-key-at-least-32-chars",
}

type ProgressDocument = {
  app: "mykaoyan"
  version: 1
  revision: number
  updatedAt: string
  updatedBy: string
  data: {
    profile: null
    progress: unknown[]
    mistakes: unknown[]
    daily: unknown[]
    dayPlans: unknown[]
    weekly: unknown[]
  }
}

describe("个人进度文档 HTTP 接口", () => {
  let app: Awaited<ReturnType<typeof createApp>>
  let origin: string
  let sql: ReturnType<typeof postgres>

  function sms() {
    return app.get(SMS_VERIFIER) as MemorySmsVerifier
  }

  async function login(phone: string) {
    const headers = { "content-type": "application/json" }
    const requested = await fetch(`${origin}/api/phone/request-code`, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone }),
    })
    expect(requested.status).toBe(200)
    const verified = await fetch(`${origin}/api/phone/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone,
        code: sms().peekCode(`+86${phone}`),
        acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
      }),
    })
    expect(verified.status).toBe(200)
    const cookie = verified.headers
      .getSetCookie()
      .map((value) => value.split(";")[0] ?? "")
      .find((value) => value.startsWith("better-auth.session_token="))
    if (!cookie) throw new Error("登录响应没有会话 cookie")
    return cookie
  }

  beforeAll(async () => {
    const config = readEnvironment(TEST_ENV)
    const url = new URL(config.DATABASE_URL!)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test") {
      throw new Error("集成测试只允许专用的本机 mykaoyan_test 临时库")
    }
    sql = postgres(config.DATABASE_URL!, { prepare: false, ssl: false })
    app = await createApp(config)
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
  })

  afterAll(async () => {
    await app?.close()
    await sql?.end({ timeout: 1 })
  })

  it("只读写本人的文档，拒绝缺失或过期的 If-Match，并追加历史版本", async () => {
    expect((await fetch(`${origin}/api/v1/progress`)).status).toBe(401)
    const cookie = await login("13500135000")
    const headers = { cookie, "content-type": "application/json" }
    const initial = await fetch(`${origin}/api/v1/progress`, { headers: { cookie } })
    expect(initial.status).toBe(200)
    expect(initial.headers.get("etag")).toBe('"revision-0"')
    const document = (await initial.json()) as ProgressDocument
    expect(document).toMatchObject({ app: "mykaoyan", version: 1, revision: 0, data: { daily: [] } })

    const missing = await fetch(`${origin}/api/v1/progress`, {
      method: "PUT",
      headers,
      body: JSON.stringify(document),
    })
    expect(missing.status).toBe(428)

    document.data.daily.push({
      date: "2030-01-02",
      minutes: { "302": 90 },
      done: "虚构完成",
      tomorrowTop: "虚构待办",
      retro: "",
    })
    const saved = await fetch(`${origin}/api/v1/progress`, {
      method: "PUT",
      headers: { ...headers, "if-match": '"revision-0"' },
      body: JSON.stringify(document),
    })
    expect(saved.status).toBe(200)
    expect(saved.headers.get("etag")).toBe('"revision-1"')
    expect(await saved.json()).toMatchObject({ etag: '"revision-1"', changes: { added: { daily: 1 } } })

    const stale = await fetch(`${origin}/api/v1/progress`, {
      method: "PUT",
      headers: { ...headers, "if-match": '"revision-0"' },
      body: JSON.stringify(document),
    })
    expect(stale.status).toBe(412)

    const current = await fetch(`${origin}/api/v1/progress`, { headers: { cookie } })
    expect(await current.json()).toMatchObject({
      revision: 1,
      updatedBy: "site",
      data: { daily: [{ date: "2030-01-02" }] },
    })
    expect(await (await fetch(`${origin}/api/v1/progress/revisions`, { headers: { cookie } })).json()).toEqual([
      expect.objectContaining({ revision: 1, etag: '"revision-1"' }),
    ])

    const otherCookie = await login("13400134000")
    expect(
      await (await fetch(`${origin}/api/v1/progress/revisions`, { headers: { cookie: otherCookie } })).json()
    ).toEqual([])
  })
})
