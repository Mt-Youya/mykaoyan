import { randomInt, randomUUID } from "node:crypto"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../app"
import type { MemorySmsVerifier } from "../auth"
import { PRIVACY_POLICY_VERSION, SMS_VERIFIER } from "../auth"
import { readEnvironment } from "../environment"
import { MembershipService } from "../membership"
describe("投稿评论权限、公开读取与删除审计 HTTP", () => {
  let app: Awaited<ReturnType<typeof createApp>>,
    off: Awaited<ReturnType<typeof createApp>>,
    sql: ReturnType<typeof postgres>,
    origin: string,
    offOrigin: string
  let admin: { id: string; cookie: string },
    owner: { id: string; cookie: string },
    member: { id: string; cookie: string },
    other: { id: string; cookie: string },
    listedId: string,
    unlistedId: string,
    pendingId: string,
    rootId: string
  const config = () =>
    readEnvironment({
      ...process.env,
      NODE_ENV: "test",
      PORT: "3001",
      COMMUNITY_ENABLED: "true",
      MEDIA_SIGNING_KEY: "fictional-submission-comments-key-32-chars",
    })
  const phones: string[] = []
  const phone = () => `199${randomInt(0, 100_000_000).toString().padStart(8, "0")}`
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
    phones.push(phone)
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
  async function submission(input: {
    accountId: string
    status: "pending" | "approved"
    listed: boolean
    title: string
  }) {
    const id = randomUUID()
    await sql`insert into submissions(id,account_id,title,summary,subject_code,size,duration,fingerprint,object_key,status,listed,reviewed_at) values(${id},${input.accountId},${input.title},'虚构投稿简介','302',1024,60,${randomUUID()},${`fictional/${id}.mp4`},${input.status},${input.listed},${input.status === "approved" ? sql`now()` : null})`
    return id
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
    admin = await login(phone())
    owner = await login(phone())
    member = await login(phone())
    other = await login(phone())
    await sql`update accounts set role='admin' where id=${admin.id}`
    listedId = await submission({ accountId: owner.id, status: "approved", listed: true, title: "虚构已上架投稿" })
    unlistedId = await submission({ accountId: owner.id, status: "approved", listed: false, title: "虚构未上架投稿" })
    pendingId = await submission({ accountId: owner.id, status: "pending", listed: false, title: "虚构待审核投稿" })
    off = await createApp(
      readEnvironment({
        ...process.env,
        NODE_ENV: "test",
        PORT: "3001",
        COMMUNITY_ENABLED: "false",
        MEDIA_SIGNING_KEY: "fictional-submission-comments-key-32-chars",
      }),
    )
    await off.listen(0, "127.0.0.1")
    offOrigin = await off.getUrl()
  })
  afterAll(async () => {
    if (sql) await sql`delete from accounts where phone in ${sql(phones.map((value) => `+86${value}`))}`
    await off?.close()
    await app?.close()
    await sql?.end({ timeout: 1 })
  })
  it("默认关闭：不返回评论且拒绝写入；未登录401", async () => {
    expect(
      readEnvironment({
        NODE_ENV: "test",
        PORT: "3001",
        MEDIA_SIGNING_KEY: "fictional-submission-comments-key-32-chars",
      }).COMMUNITY_ENABLED,
    ).toBe(false)
    expect(
      await (await call(`submissions/${listedId}/comments`, undefined, undefined, "GET", offOrigin)).json(),
    ).toMatchObject({ enabled: false, items: [] })
    expect((await call(`submissions/${listedId}/comments`, undefined, { body: "虚构未开放" })).status).toBe(401)
    expect(
      (await call(`submissions/${listedId}/comments`, owner.cookie, { body: "虚构未开放" }, "POST", offOrigin)).status,
    ).toBe(403)
  })
  it("访客只能读已通过并上架投稿的评论；未上架、待审核与不存在的投稿404", async () => {
    const response = await call(`submissions/${listedId}/comments`)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toMatchObject({
      enabled: true,
      items: [],
      viewer: { signedIn: false, member: false, owner: false },
    })
    for (const id of [unlistedId, pendingId, randomUUID(), "not-a-uuid"])
      expect((await call(`submissions/${id}/comments`)).status).toBe(404)
    expect((await call(`submissions/${listedId}/comments?page=-1`)).status).toBe(400)
    // 未上架投稿下的历史评论不能公开读。
    await sql`insert into submission_comments(submission_id,account_id,body) values(${unlistedId},${owner.id},'虚构未上架评论')`
    expect((await call(`submissions/${unlistedId}/comments`)).status).toBe(404)
  })
  it("未登录401，非会员403，上传者本人免会员可评论和回复，会员可评论", async () => {
    expect((await call(`submissions/${listedId}/comments`, undefined, { body: "虚构访客" })).status).toBe(401)
    expect((await call(`submissions/${listedId}/comments`, other.cookie, { body: "虚构非会员" })).status).toBe(403)
    const own = await call(`submissions/${listedId}/comments`, owner.cookie, { body: "虚构上传者评论", parentId: null })
    expect(own.status).toBe(201)
    rootId = ((await own.json()) as { id: string }).id
    // 上传者本人可以回复任意一层根评论，不需要会员期。
    expect(
      (await call(`submissions/${listedId}/comments`, owner.cookie, { body: "虚构上传者回复", parentId: rootId }))
        .status,
    ).toBe(201)
    await app
      .get(MembershipService)
      .grant({ id: admin.id, role: "admin" }, { accountId: member.id, reason: "虚构会员开通" })
    const created = await call(`submissions/${listedId}/comments`, member.cookie, {
      body: "虚构会员评论",
      parentId: rootId,
    })
    expect(created.status).toBe(201)
  })
  it("回复只能一层、父评论必须同投稿、入参严格校验", async () => {
    const response = await call(`submissions/${listedId}/comments`, member.cookie, {
      body: "虚构回复",
      parentId: rootId,
    })
    const replyId = ((await response.json()) as { id: string }).id
    expect(
      (await call(`submissions/${listedId}/comments`, member.cookie, { body: "虚构再回复", parentId: replyId })).status,
    ).toBe(400)
    const [foreign] = await sql<
      { id: string }[]
    >`insert into submission_comments(submission_id,account_id,body) values(${unlistedId},${owner.id},'虚构他投稿根评论') returning id`
    expect(
      (await call(`submissions/${listedId}/comments`, member.cookie, { body: "虚构跨投稿回复", parentId: foreign!.id }))
        .status,
    ).toBe(400)
    expect((await call(`submissions/${unlistedId}/comments`, member.cookie, { body: "虚构" }, "POST")).status).toBe(404)
    expect((await call(`submissions/${listedId}/comments`, member.cookie, { body: "", parentId: null })).status).toBe(
      400,
    )
    expect(
      (await call(`submissions/${listedId}/comments`, member.cookie, { body: "虚构", accountId: other.id })).status,
    ).toBe(400)
  })
  it("登录访客能读到本人可否评论（会员/上传者）", async () => {
    expect(await (await call(`submissions/${listedId}/comments`, member.cookie)).json()).toMatchObject({
      viewer: { signedIn: true, member: true, owner: false },
    })
    expect(await (await call(`submissions/${listedId}/comments`, owner.cookie)).json()).toMatchObject({
      viewer: { signedIn: true, member: false, owner: true },
    })
    expect(await (await call(`submissions/${listedId}/comments`, other.cookie)).json()).toMatchObject({
      viewer: { signedIn: true, member: false, owner: false },
    })
  })
  it("会员过期后不能再发但历史保留；上传者例外不受会员期影响", async () => {
    await sql`update membership_periods set starts_at='2020-01-01',ends_at='2020-12-31' where account_id=${member.id}`
    expect((await call(`submissions/${listedId}/comments`, member.cookie, { body: "虚构过期发表" })).status).toBe(403)
    expect(JSON.stringify(await (await call(`submissions/${listedId}/comments`)).json())).toContain("虚构会员评论")
    expect((await call(`submissions/${listedId}/comments`, owner.cookie, { body: "虚构上传者仍可评论" })).status).toBe(
      201,
    )
  })
  it("关键词沿用讲的评论关键词，命中拒绝", async () => {
    expect((await call("admin/comments/keywords", admin.cookie, { keywords: ["虚构投稿禁词"] }, "PUT")).status).toBe(
      200,
    )
    expect((await call(`submissions/${listedId}/comments`, owner.cookie, { body: "包含虚构投稿禁词" })).status).toBe(
      400,
    )
    expect((await call("admin/comments/keywords", admin.cookie, { keywords: [] }, "PUT")).status).toBe(200)
  })
  it("管理员列表与删除要求管理员；删除留审计并遮蔽正文，重复删除409", async () => {
    for (const [method, path] of [
      ["GET", "admin/submission-comments"],
      ["DELETE", "admin/submission-comments/not-a-uuid"],
    ] as const) {
      expect((await call(path, undefined, method === "DELETE" ? { reason: "虚构" } : undefined, method)).status).toBe(
        401,
      )
      expect(
        (await call(path, other.cookie, method === "DELETE" ? { reason: "虚构" } : undefined, method)).status,
      ).toBe(403)
    }
    const list = await call("admin/submission-comments", admin.cookie)
    expect(list.status).toBe(200)
    expect(list.headers.get("cache-control")).toBe("no-store")
    const items = ((await list.json()) as { items: { id: string; submissionTitle: string }[] }).items
    expect(items.find((item) => item.id === rootId)).toMatchObject({ submissionTitle: "虚构已上架投稿" })
    expect((await call(`admin/submission-comments/${rootId}`, admin.cookie, { reason: " " }, "DELETE")).status).toBe(
      400,
    )
    expect(
      (await call(`admin/submission-comments/${rootId}`, admin.cookie, { reason: "虚构删除原因" }, "DELETE")).status,
    ).toBe(200)
    const publicList = await (await call(`submissions/${listedId}/comments`)).text()
    expect(publicList).toContain("已删除")
    expect(publicList).not.toContain("虚构上传者评论")
    const audit = (await (await call("admin/submission-comments", admin.cookie)).json()) as {
      items: { id: string; deleteReason: string; deletedBy: string; deletedAt: string }[]
    }
    expect(audit.items.find((item) => item.id === rootId)).toMatchObject({
      deleteReason: "虚构删除原因",
      deletedBy: admin.id,
    })
    expect(
      (await call(`admin/submission-comments/${rootId}`, admin.cookie, { reason: "改写审计" }, "DELETE")).status,
    ).toBe(409)
    expect(
      (await call(`admin/submission-comments/${randomUUID()}`, admin.cookie, { reason: "虚构" }, "DELETE")).status,
    ).toBe(404)
    // 删除后的根评论不能再被回复。
    expect(
      (await call(`submissions/${listedId}/comments`, owner.cookie, { body: "虚构回复已删除", parentId: rootId }))
        .status,
    ).toBe(400)
  })
})
