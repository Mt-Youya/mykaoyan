import { randomUUID } from "node:crypto"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../app"
import type { MemorySmsVerifier } from "../auth"
import { PRIVACY_POLICY_VERSION, SMS_VERIFIER } from "../auth"
import { readEnvironment } from "../environment"
import { MembershipService } from "../membership"
describe("评论权限、回复与删除 HTTP", () => {
  let app: Awaited<ReturnType<typeof createApp>>,
    off: Awaited<ReturnType<typeof createApp>>,
    sql: ReturnType<typeof postgres>,
    origin: string,
    offOrigin: string
  let admin: { id: string; cookie: string },
    a: { id: string; cookie: string },
    b: { id: string; cookie: string },
    rootId: string
  const slug = `comment-lesson-${randomUUID()}`,
    otherSlug = `comment-other-${randomUUID()}`
  const config = () =>
    readEnvironment({
      ...process.env,
      NODE_ENV: "test",
      PORT: "3001",
      COMMUNITY_ENABLED: "true",
      MEDIA_SIGNING_KEY: "fictional-comments-test-key-32-characters",
    })
  const call = (
    path: string,
    cookie?: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    base = origin,
  ) =>
    fetch(`${base}/api/${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  async function login(phone: string) {
    expect((await call("phone/request-code", undefined, { phone })).status).toBe(200)
    const response = await call("phone/verify", undefined, {
      phone,
      code: (app.get(SMS_VERIFIER) as MemorySmsVerifier).peekCode(`+86${phone}`),
      acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
      acceptedTermsVersion: "2026-10-30",
    })
    expect(response.status).toBe(200)
    const cookie = response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .find((v) => v?.startsWith("better-auth.session_token="))!
    const [row] = await sql<{ id: string }[]>`select id from accounts where phone=${`+86${phone}`}`
    return { id: row!.id, cookie }
  }
  beforeAll(async () => {
    const env = config(),
      url = new URL(env.DATABASE_URL!)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test")
      throw new Error("只允许专用本机临时库")
    sql = postgres(env.DATABASE_URL!, { ssl: false, prepare: false })
    app = await createApp(env)
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
    admin = await login("18800002101")
    a = await login("18800002102")
    b = await login("18800002103")
    await sql`update accounts set role='admin' where id=${admin.id}`
    const [course] =
      await sql`insert into courses(slug,title,subject_code,summary,position,listed) values(${randomUUID()},'虚构课程','302','',0,true) returning id`
    const [chapter] =
      await sql`insert into chapters(course_id,title,position,listed) values(${course!.id},'虚构章',0,true) returning id`
    for (const name of [slug, otherSlug])
      await sql`insert into lessons(chapter_id,slug,title,position,video_key,script_markdown,listed) values(${chapter!.id},${name},'虚构讲',0,'fictional/video','',true)`
    off = await createApp(
      readEnvironment({
        ...process.env,
        NODE_ENV: "test",
        PORT: "3001",
        COMMUNITY_ENABLED: "false",
        MEDIA_SIGNING_KEY: "fictional-comments-test-key-32-characters",
      }),
    )
    await off.listen(0, "127.0.0.1")
    offOrigin = await off.getUrl()
  })
  afterAll(async () => {
    await off?.close()
    await app?.close()
    await sql?.end({ timeout: 1 })
  })
  it("默认关闭且不能绕过；未登录401，非会员403；开通后方可发表", async () => {
    expect(
      readEnvironment({
        NODE_ENV: "test",
        PORT: "3001",
        MEDIA_SIGNING_KEY: "fictional-comments-test-key-32-characters",
      }).COMMUNITY_ENABLED,
    ).toBe(false)
    expect(await (await call(`lessons/${slug}/comments`, undefined, undefined, "GET", offOrigin)).json()).toMatchObject(
      { enabled: false, items: [] },
    )
    expect((await call(`lessons/${slug}/comments`, undefined, { body: "虚构讨论" })).status).toBe(401)
    expect((await call(`lessons/${slug}/comments`, a.cookie, { body: "虚构讨论" })).status).toBe(403)
    await app.get(MembershipService).grant({ id: admin.id, role: "admin" }, { accountId: a.id, reason: "虚构会员开通" })
    expect(
      (await call(`lessons/${slug}/comments`, a.cookie, { body: "未开放", parentId: null }, "POST", offOrigin)).status,
    ).toBe(403)
    const created = await call(`lessons/${slug}/comments`, a.cookie, { body: "虚构讨论", parentId: null })
    expect(created.status).toBe(201)
    rootId = ((await created.json()) as { id: string }).id
  })
  it("访客可读，允许一层回复，但不能跨讲、回复回复或写别人的身份", async () => {
    const reply = await call(`lessons/${slug}/comments`, a.cookie, { body: "虚构回复", parentId: rootId })
    expect(reply.status).toBe(201)
    const replyId = ((await reply.json()) as { id: string }).id
    expect((await call(`lessons/${slug}/comments`, a.cookie, { body: "再回复", parentId: replyId })).status).toBe(400)
    expect((await call(`lessons/${otherSlug}/comments`, a.cookie, { body: "跨讲回复", parentId: rootId })).status).toBe(
      400,
    )
    expect((await call(`lessons/${slug}/comments`, a.cookie, { body: "冒用", accountId: b.id })).status).toBe(400)
    const list = (await (await call(`lessons/${slug}/comments`)).json()) as { items: { id: string; body: string }[] }
    expect(list.items.map((c) => c.body)).toContain("虚构讨论")
    await sql`update lessons set listed=false where slug=${otherSlug}`
    expect((await call(`lessons/${otherSlug}/comments`)).status).toBe(404)
  })
  it("管理员读取评论与关键词也要求会话和当前管理员角色", async () => {
    for (const path of ["admin/comments", "admin/comments/keywords"]) {
      expect((await call(path)).status).toBe(401)
      expect((await call(path, b.cookie)).status).toBe(403)
      const response = await call(path, admin.cookie)
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("no-store")
    }
    expect(await (await call("admin/comments/keywords", admin.cookie)).json()).toHaveProperty("keywords")
  })
  it("管理员维护关键词，命中拒绝；普通账号不能改关键词", async () => {
    expect((await call("admin/comments/keywords", b.cookie, { keywords: ["虚构禁词"] }, "PUT")).status).toBe(403)
    expect(
      (await call("admin/comments/keywords", admin.cookie, { keywords: ["虚构禁词", "TeSt"] }, "PUT")).status,
    ).toBe(200)
    expect((await call(`lessons/${slug}/comments`, a.cookie, { body: "包含虚构禁词" })).status).toBe(400)
    expect((await call(`lessons/${slug}/comments`, a.cookie, { body: "ＴＥＳＴ" })).status).toBe(400)
  })
  it("过期后历史保留，新发403；删除必须管理员与原因，前台不泄露删除原文", async () => {
    await sql`update membership_periods set starts_at='2020-01-01',ends_at='2020-12-31' where account_id=${a.id}`
    expect((await call(`lessons/${slug}/comments`, a.cookie, { body: "过期发表" })).status).toBe(403)
    expect(JSON.stringify(await (await call(`lessons/${slug}/comments`)).json())).toContain("虚构讨论")
    expect((await call(`admin/comments/${rootId}`, b.cookie, { reason: "虚构原因" }, "DELETE")).status).toBe(403)
    expect((await call(`admin/comments/${rootId}`, admin.cookie, { reason: " " }, "DELETE")).status).toBe(400)
    expect((await call(`admin/comments/${rootId}`, admin.cookie, { reason: "虚构删除原因" }, "DELETE")).status).toBe(
      200,
    )
    const list = await (await call(`lessons/${slug}/comments`)).text()
    expect(list).toContain("已删除")
    expect(list).not.toContain("虚构讨论")
    const audit = (await (await call("admin/comments", admin.cookie)).json()) as {
      items: { id: string; deleteReason: string; deletedBy: string }[]
    }
    expect(audit.items.find((c) => c.id === rootId)).toMatchObject({
      deleteReason: "虚构删除原因",
      deletedBy: admin.id,
    })
    expect((await call(`admin/comments/${rootId}`, admin.cookie, { reason: "改写审计" }, "DELETE")).status).toBe(409)
  })
})
