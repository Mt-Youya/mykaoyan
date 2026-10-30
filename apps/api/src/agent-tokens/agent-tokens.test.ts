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

type TokenSummary = {
  id: string
  name: string
  last4: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

describe("Agent 令牌 HTTP 接口", () => {
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
        acceptedTermsVersion: "2026-10-30",
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

  async function createToken(cookie: string, name = "测试 agent") {
    const response = await fetch(`${origin}/api/agent-tokens`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name }),
    })
    expect(response.status).toBe(201)
    return (await response.json()) as TokenSummary & { token: string }
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

  it("生成时只显示一次明文，列表只含末四位", async () => {
    const cookie = await login("18800000001")
    const created = await createToken(cookie, "Codex 会话")
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(created.last4).toBe(created.token.slice(-4))
    expect(created.lastUsedAt).toBeNull()
    expect(created.revokedAt).toBeNull()

    const list = await fetch(`${origin}/api/agent-tokens`, { headers: { cookie } })
    expect(list.status).toBe(200)
    const rows = (await list.json()) as TokenSummary[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: created.id, name: "Codex 会话", last4: created.last4 })
    expect(JSON.stringify(rows)).not.toContain(created.token)
  })

  it("名称非法或夹带未知字段时拒绝创建", async () => {
    const cookie = await login("18800000002")
    const responses = await Promise.all(
      [{ name: "" }, { name: "x".repeat(41) }, { name: "ok", extra: true }].map((body) =>
        fetch(`${origin}/api/agent-tokens`, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      )
    )
    for (const response of responses) expect(response.status).toBe(400)
  })

  it("Bearer 可读写本人进度，但不能建会话、读别人的数据或进管理员接口", async () => {
    const cookie = await login("18800000003")
    const { token } = await createToken(cookie)

    const initial = await fetch(`${origin}/api/v1/progress`, { headers: { authorization: `Bearer ${token}` } })
    expect(initial.status).toBe(200)
    expect(initial.headers.get("etag")).toBe('"revision-0"')
    const document = (await initial.json()) as ProgressDocument

    document.data.daily.push({
      date: "2030-01-03",
      minutes: { "302": 60 },
      done: "虚构完成",
      tomorrowTop: "虚构待办",
      retro: "",
    })
    const saved = await fetch(`${origin}/api/v1/progress`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "if-match": '"revision-0"' },
      body: JSON.stringify(document),
    })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ etag: '"revision-1"', changes: { added: { daily: 1 } } })

    const session = await fetch(`${origin}/api/auth/get-session`, { headers: { authorization: `Bearer ${token}` } })
    expect(session.status).toBe(200)
    const sessionBody = (await session.json()) as { user?: unknown } | null
    expect(sessionBody?.user ?? null).toBeNull()

    const otherCookie = await login("18800000004")
    const other = await createToken(otherCookie)
    const otherProgress = await fetch(`${origin}/api/v1/progress`, {
      headers: { authorization: `Bearer ${other.token}` },
    })
    expect(otherProgress.status).toBe(200)
    expect(((await otherProgress.json()) as ProgressDocument).data.daily).toEqual([])

    // 管理员接口只认网页会话：Bearer 令牌连 SessionGuard 都过不了。
    const admin = await fetch(`${origin}/api/admin/content`, { headers: { authorization: `Bearer ${token}` } })
    expect(admin.status).toBe(401)

    const tokenCreate = await fetch(`${origin}/api/agent-tokens`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "由令牌创建" }),
    })
    expect(tokenCreate.status).toBe(401)
  })

  it("吊销后立即失效，列表显示吊销时间与最后使用时间", async () => {
    const cookie = await login("18800000005")
    const { id, token } = await createToken(cookie)

    const used = await fetch(`${origin}/api/v1/progress`, { headers: { authorization: `Bearer ${token}` } })
    expect(used.status).toBe(200)

    const before = (await (await fetch(`${origin}/api/agent-tokens`, { headers: { cookie } })).json()) as TokenSummary[]
    expect(before[0]?.lastUsedAt).not.toBeNull()

    const revoked = await fetch(`${origin}/api/agent-tokens/${id}`, { method: "DELETE", headers: { cookie } })
    expect(revoked.status).toBe(200)
    expect(await revoked.json()).toEqual({ revoked: true })

    const rejected = await fetch(`${origin}/api/v1/progress`, { headers: { authorization: `Bearer ${token}` } })
    expect(rejected.status).toBe(401)

    const after = (await (await fetch(`${origin}/api/agent-tokens`, { headers: { cookie } })).json()) as TokenSummary[]
    expect(after[0]?.revokedAt).not.toBeNull()
    expect((await fetch(`${origin}/api/agent-tokens/${id}`, { method: "DELETE", headers: { cookie } })).status).toBe(
      404
    )
  })

  it("不能吊销别人的令牌，也不能用无效 id", async () => {
    const ownerCookie = await login("18800000006")
    const strangerCookie = await login("18800000007")
    const { id } = await createToken(ownerCookie)

    expect(
      (await fetch(`${origin}/api/agent-tokens/${id}`, { method: "DELETE", headers: { cookie: strangerCookie } }))
        .status
    ).toBe(404)
    expect(
      (await fetch(`${origin}/api/agent-tokens/not-a-uuid`, { method: "DELETE", headers: { cookie: ownerCookie } }))
        .status
    ).toBe(400)
    expect(
      (await fetch(`${origin}/api/agent-tokens`, { headers: { authorization: "Bearer not-a-real-token" } })).status
    ).toBe(401)
  })
})
