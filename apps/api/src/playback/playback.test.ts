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

/**
 * 播放令牌签发（真实 Postgres）。
 *
 * 验签按媒体 Worker 的算法用 WebCrypto 独立实现，确保服务端签发的令牌能被 Worker 接受。
 */
describe("视频播放令牌签发", () => {
  let app: Awaited<ReturnType<typeof createApp>>
  let origin: string
  let sql: ReturnType<typeof postgres>

  async function verifyLikeWorker(token: string, key: string) {
    const secret = TEST_ENV.MEDIA_SIGNING_KEY!
    const parts = token.split(".")
    expect(parts).toHaveLength(2)
    const [payload, signature] = parts as [string, string]
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>
    expect(claims.v).toBe(1)
    expect(claims.key).toBe(key)
    expect(typeof claims.subject).toBe("string")
    const now = Math.floor(Date.now() / 1000)
    expect(Number(claims.exp)).toBeGreaterThan(now)
    expect(Number(claims.iat)).toBeLessThanOrEqual(now)
    const hmac = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    )
    const valid = await crypto.subtle.verify(
      "HMAC",
      hmac,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(payload)
    )
    expect(valid).toBe(true)
    return claims
  }

  beforeAll(async () => {
    const config = readEnvironment({ ...TEST_ENV })
    const url = new URL(config.DATABASE_URL!)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test") {
      throw new Error("集成测试只允许专用的本机 mykaoyan_test 临时库")
    }
    sql = postgres(config.DATABASE_URL!, { prepare: false, ssl: false })
    await cleanup()

    const [course] = await sql<{ id: string }[]>`
      insert into courses (subject_code, slug, title, summary, position, listed)
      values ('204', 'playback-course', '播放示例课程', '虚构', 10, true) returning id`
    const [chapter] = await sql<{ id: string }[]>`
      insert into chapters (course_id, title, position, listed)
      values (${course!.id}, '播放示例章', 1, true) returning id`
    await sql`
      insert into lessons (chapter_id, slug, title, position, video_key, script_markdown, listed)
      values (${chapter!.id}, 'playback-lesson', '播放示例讲', 1, 'videos/playback-example.mp4', '# 讲稿', true),
             (${chapter!.id}, 'playback-hidden', '未上架讲', 2, 'videos/hidden.mp4', '# 讲稿', false)`

    app = await createApp(config)
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
  })

  async function cleanup() {
    const config = readEnvironment({ ...TEST_ENV })
    const client = postgres(config.DATABASE_URL!, { prepare: false, ssl: false })
    try {
      await client`delete from lessons where slug like 'playback-%'`
      await client`delete from chapters where title = '播放示例章'`
      await client`delete from courses where slug = 'playback-course'`
    } finally {
      await client.end({ timeout: 1 })
    }
  }

  afterAll(async () => {
    await cleanup()
    await sql?.end({ timeout: 1 })
    await app?.close()
  })

  it("为已上架讲签发可被媒体 Worker 验签的令牌", async () => {
    const response = await fetch(`${origin}/api/lessons/playback-lesson/playback-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttlSeconds: 120 }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { token: string; videoKey: string; mediaUrl: string; expiresAt: string }
    expect(body.videoKey).toBe("videos/playback-example.mp4")
    expect(body.mediaUrl).toContain("videos/playback-example.mp4")
    expect(body.mediaUrl).toContain("token=")
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now())
    await verifyLikeWorker(body.token, "videos/playback-example.mp4")
  })

  it("首次请求下发访客 cookie，后续请求复用同一个签发者", async () => {
    const first = await fetch(`${origin}/api/lessons/playback-lesson/playback-token`, { method: "POST" })
    const cookie = first.headers.get("set-cookie")
    expect(cookie).toContain("mk_visitor=")
    const visitor = /mk_visitor=([0-9a-f-]{36})/.exec(cookie!)![1]!
    const claims = await verifyLikeWorker(
      ((await first.json()) as { token: string }).token,
      "videos/playback-example.mp4"
    )
    expect(claims.subject).toBe(visitor)

    const second = await fetch(`${origin}/api/lessons/playback-lesson/playback-token`, {
      method: "POST",
      headers: { cookie: `mk_visitor=${visitor}` },
    })
    expect(second.headers.get("set-cookie")).toBeNull()
    const again = await verifyLikeWorker(
      ((await second.json()) as { token: string }).token,
      "videos/playback-example.mp4"
    )
    expect(again.subject).toBe(visitor)
  })

  it.each([
    { label: "0", body: { ttlSeconds: 0 } },
    { label: "超过上限", body: { ttlSeconds: 3601 } },
    { label: "非整数", body: { ttlSeconds: 1.5 } },
    { label: "字符串", body: { ttlSeconds: "600" } },
    { label: "多余字段", body: { ttlSeconds: 60, extra: true } },
  ])("拒绝非法 TTL：$label", async ({ body }) => {
    const response = await fetch(`${origin}/api/lessons/playback-lesson/playback-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    expect(response.status).toBe(400)
    expect(response.headers.get("content-type")).toContain("application/problem+json")
  })

  it("登录状态下按账号签发，而不是访客标识", async () => {
    // 与其他集成测试共用同一个临时库：先清掉登录频率记录，避免 60 秒冷却让该用例不稳定。
    await sql`delete from phone_login_attempts`
    const sms = app.get(SMS_VERIFIER) as MemorySmsVerifier
    const phone = "13700137000"
    const requested = await fetch(`${origin}/api/phone/request-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    })
    expect(requested.status).toBe(200)
    const verified = await fetch(`${origin}/api/phone/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        code: sms.peekCode(`+86${phone}`),
        acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
        acceptedTermsVersion: "2026-10-30",
      }),
    })
    expect(verified.status).toBe(200)
    const { accountId } = (await verified.json()) as { accountId: string }
    const cookie = verified.headers
      .getSetCookie()
      .map((value) => value.split(";")[0] ?? "")
      .find((value) => value.startsWith("better-auth.session_token="))
    expect(cookie).toBeTruthy()

    const response = await fetch(`${origin}/api/lessons/playback-lesson/playback-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookie! },
      body: JSON.stringify({ ttlSeconds: 60 }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { token: string }
    const claims = await verifyLikeWorker(body.token, "videos/playback-example.mp4")
    expect(claims.subject).toBe(accountId)
  })

  it("未上架的讲不签发令牌", async () => {
    const response = await fetch(`${origin}/api/lessons/playback-hidden/playback-token`, { method: "POST" })
    expect(response.status).toBe(404)
  })
})
