import { randomInt, randomUUID } from "node:crypto"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../app"
import { PRIVACY_POLICY_VERSION, SMS_VERIFIER } from "../auth"
import type { MemorySmsVerifier } from "../auth"
import { readEnvironment } from "../environment"
type PaperCommentItem = {
  id: string
  parentId: string | null
  author: string
  body: string
  deleted: boolean
  createdAt: string
  parent: { id: string; author: string; body: string } | null
}
type PaperCommentBody = {
  enabled: boolean
  items: PaperCommentItem[]
  hasMore: boolean
  viewer: { signedIn: boolean; member: boolean; owner: boolean }
}
/**
 * 用户试卷评论：公开读取、会员/上传者写入、一层回复、关键词与管理员删除审计。
 *
 * 全部使用虚构试卷标题与虚构评论；仓库与测试不出现真实真题内容。
 */
describe("试卷评论权限、公开读取与删除审计 HTTP", () => {
  let app: Awaited<ReturnType<typeof createApp>>,
    off: Awaited<ReturnType<typeof createApp>>,
    sql: ReturnType<typeof postgres>,
    origin: string,
    offOrigin: string
  let admin: { id: string; cookie: string },
    owner: { id: string; cookie: string },
    member: { id: string; cookie: string },
    other: { id: string; cookie: string }
  let unlistedId: string, rootId: string
  const phones: string[] = []
  const prefix = "u-fictional-paper-comments-"
  const phone = () => `199${randomInt(0, 100_000_000).toString().padStart(8, "0")}`
  const config = () =>
    readEnvironment({
      ...process.env,
      NODE_ENV: "test",
      PORT: "3001",
      COMMUNITY_ENABLED: "true",
      MEDIA_SIGNING_KEY: "fictional-paper-comments-key-32-chars",
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
  /** 未上架、待审与有主用户试卷都通过 SQL 直接造，避免依赖用户试卷提交接口。 */
  async function userPaper(input: {
    slug: string
    title: string
    ownerId: string
    reviewStatus: "pending" | "approved"
    listed: boolean
  }) {
    const [row] = await sql<
      { id: string }[]
    >`insert into papers(subject_code,year,slug,title,position,listed,origin,review_status,owner_account_id,rights_confirmed_at,reviewed_at,reviewer_id) values('408',2099,${input.slug},${input.title},0,${input.listed},'user',${input.reviewStatus},${input.ownerId},now(),${input.reviewStatus === "approved" ? sql`now()` : null},${input.reviewStatus === "approved" ? admin.id : null}) returning id`
    return row!.id
  }
  /** 站主真题：`origin='admin'`、默认已通过。 */
  async function adminPaper(slug: string, title: string, listed: boolean) {
    const [row] = await sql<
      { id: string }[]
    >`insert into papers(subject_code,year,slug,title,position,listed) values('408',2099,${slug},${title},1,${listed}) returning id`
    return row!.id
  }
  const body = (response: Response) => response.json() as Promise<PaperCommentBody>
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
    await userPaper({
      slug: `${prefix}listed`,
      title: "虚构已上架试卷评论标题",
      ownerId: owner.id,
      reviewStatus: "approved",
      listed: true,
    })
    unlistedId = await userPaper({
      slug: `${prefix}unlisted`,
      title: "虚构未上架试卷",
      ownerId: owner.id,
      reviewStatus: "approved",
      listed: false,
    })
    await userPaper({
      slug: `${prefix}pending`,
      title: "虚构待审试卷",
      ownerId: owner.id,
      reviewStatus: "pending",
      listed: false,
    })
    await adminPaper("fictional-paper-comments-admin", "虚构真题试卷评论标题", true)
    await adminPaper("fictional-paper-comments-admin-unlisted", "虚构未上架真题", false)
    off = await createApp(
      readEnvironment({
        ...process.env,
        NODE_ENV: "test",
        PORT: "3001",
        COMMUNITY_ENABLED: "false",
        MEDIA_SIGNING_KEY: "fictional-paper-comments-key-32-chars",
      }),
    )
    await off.listen(0, "127.0.0.1")
    offOrigin = await off.getUrl()
  })
  afterAll(async () => {
    if (sql) {
      await sql`delete from papers where slug like ${`${prefix}%`} or slug like 'fictional-paper-comments-%'`
      await sql`delete from accounts where phone in ${sql(phones.map((value) => `+86${value}`))}`
    }
    await off?.close()
    await app?.close()
    await sql?.end({ timeout: 1 })
  })
  it("默认关闭：公开读取返回 enabled:false，发表403，未登录401", async () => {
    expect(
      readEnvironment({
        NODE_ENV: "test",
        PORT: "3001",
        MEDIA_SIGNING_KEY: "fictional-paper-comments-key-32-chars",
      }).COMMUNITY_ENABLED,
    ).toBe(false)
    expect(
      await (await call(`papers/${prefix}listed/comments`, undefined, undefined, "GET", offOrigin)).json(),
    ).toMatchObject({ enabled: false, items: [] })
    expect(
      (await call(`papers/${prefix}listed/comments`, owner.cookie, { body: "虚构未开放" }, "POST", offOrigin)).status,
    ).toBe(403)
    expect(
      (await call(`papers/${prefix}listed/comments`, undefined, { body: "虚构访客" }, "POST", offOrigin)).status,
    ).toBe(401)
  })
  it("访客可读已上架用户试卷与真题的评论；未上架、待审与不存在404", async () => {
    const user = await call(`papers/${prefix}listed/comments`)
    expect(user.status).toBe(200)
    expect(user.headers.get("cache-control")).toBe("no-store")
    expect(await body(user)).toMatchObject({
      enabled: true,
      items: [],
      viewer: { signedIn: false, member: false, owner: false },
    })
    expect(await (await call("papers/fictional-paper-comments-admin/comments")).json()).toMatchObject({
      enabled: true,
    })
    for (const slug of [
      `${prefix}unlisted`,
      `${prefix}pending`,
      "fictional-paper-comments-admin-unlisted",
      randomUUID(),
      "not-found",
    ])
      expect((await call(`papers/${slug}/comments`)).status).toBe(404)
    expect((await call(`papers/${prefix}listed/comments?page=-1`)).status).toBe(400)
    // 未上架试卷下的历史评论不能公开读。
    await sql`insert into paper_comments(paper_id,account_id,body) values(${unlistedId},${owner.id},'虚构未上架评论')`
    expect((await call(`papers/${prefix}unlisted/comments`)).status).toBe(404)
  })
  it("未登录401，非会员且非上传者403，上传者本人免会员可评论和回复，会员可评论", async () => {
    expect((await call(`papers/${prefix}listed/comments`, undefined, { body: "虚构访客" })).status).toBe(401)
    expect((await call(`papers/${prefix}listed/comments`, other.cookie, { body: "虚构非会员" })).status).toBe(403)
    // 管理员在别人的试卷下同样需要会员，不能绕过会员门。
    expect((await call(`papers/${prefix}listed/comments`, admin.cookie, { body: "虚构管理员" })).status).toBe(403)
    const own = await call(`papers/${prefix}listed/comments`, owner.cookie, {
      body: "虚构上传者评论",
      parentId: null,
    })
    expect(own.status).toBe(201)
    rootId = ((await own.json()) as { id: string }).id
    // 上传者本人可以回复根评论，不需要会员期。
    expect(
      (await call(`papers/${prefix}listed/comments`, owner.cookie, { body: "虚构上传者回复", parentId: rootId }))
        .status,
    ).toBe(201)
    await sql`insert into membership_periods(account_id,starts_at,ends_at,source,reason,actor_id) values(${member.id},now()-interval '1 day',now()+interval '30 days','manual','虚构开通',${admin.id})`
    const created = await call(`papers/${prefix}listed/comments`, member.cookie, {
      body: "虚构会员评论",
      parentId: rootId,
    })
    expect(created.status).toBe(201)
    // 真题评论与用户试卷评论走同一套规则。
    expect(
      (
        await call("papers/fictional-paper-comments-admin/comments", member.cookie, {
          body: "虚构真题评论",
          parentId: null,
        })
      ).status,
    ).toBe(201)
  })
  it("回复只能一层、父评论必须同试卷、入参严格校验，关键词沿用讲评论", async () => {
    const reply = await call(`papers/${prefix}listed/comments`, member.cookie, {
      body: "虚构回复",
      parentId: rootId,
    })
    const replyId = ((await reply.json()) as { id: string }).id
    expect(
      (await call(`papers/${prefix}listed/comments`, member.cookie, { body: "虚构再回复", parentId: replyId })).status,
    ).toBe(400)
    const [foreign] = await sql<
      { id: string }[]
    >`insert into paper_comments(paper_id,account_id,body) values(${unlistedId},${owner.id},'虚构他卷根评论') returning id`
    expect(
      (await call(`papers/${prefix}listed/comments`, member.cookie, { body: "虚构跨卷回复", parentId: foreign!.id }))
        .status,
    ).toBe(400)
    expect((await call(`papers/${prefix}listed/comments`, member.cookie, { body: "" })).status).toBe(400)
    expect(
      (await call(`papers/${prefix}listed/comments`, member.cookie, { body: "虚构", accountId: other.id })).status,
    ).toBe(400)
    expect((await call(`papers/${prefix}listed/comments`, member.cookie, { body: "虚".repeat(2001) })).status).toBe(400)
    expect((await call("admin/comments/keywords", admin.cookie, { keywords: ["虚构试卷禁词"] }, "PUT")).status).toBe(
      200,
    )
    expect((await call(`papers/${prefix}listed/comments`, member.cookie, { body: "包含虚构试卷禁词" })).status).toBe(
      400,
    )
    expect((await call("admin/comments/keywords", admin.cookie, { keywords: [] }, "PUT")).status).toBe(200)
  })
  it("公开列表带 viewer：会员、上传者与普通账号三态", async () => {
    expect(await (await call(`papers/${prefix}listed/comments`, member.cookie)).json()).toMatchObject({
      viewer: { signedIn: true, member: true, owner: false },
    })
    expect(await (await call(`papers/${prefix}listed/comments`, owner.cookie)).json()).toMatchObject({
      viewer: { signedIn: true, member: false, owner: true },
    })
    expect(await (await call(`papers/${prefix}listed/comments`, other.cookie)).json()).toMatchObject({
      viewer: { signedIn: true, member: false, owner: false },
    })
  })
  it("会员过期后不能再发但历史保留；上传者例外不受会员期影响", async () => {
    await sql`update membership_periods set starts_at='2020-01-01',ends_at='2020-12-31' where account_id=${member.id}`
    expect((await call(`papers/${prefix}listed/comments`, member.cookie, { body: "虚构过期发表" })).status).toBe(403)
    expect(JSON.stringify(await (await call(`papers/${prefix}listed/comments`)).json())).toContain("虚构会员评论")
    expect((await call(`papers/${prefix}listed/comments`, owner.cookie, { body: "虚构上传者仍可评论" })).status).toBe(
      201,
    )
  })
  it("管理员列表要求管理员、支持筛选；删除写审计、重复删除409", async () => {
    for (const [method, path] of [
      ["GET", "admin/paper-comments"],
      ["DELETE", "admin/paper-comments/not-a-uuid"],
    ] as const) {
      expect((await call(path, undefined, method === "DELETE" ? { reason: "虚构" } : undefined, method)).status).toBe(
        401,
      )
      expect(
        (await call(path, other.cookie, method === "DELETE" ? { reason: "虚构" } : undefined, method)).status,
      ).toBe(403)
    }
    const list = await call("admin/paper-comments", admin.cookie)
    expect(list.status).toBe(200)
    expect(list.headers.get("cache-control")).toBe("no-store")
    const items = ((await list.json()) as { items: (PaperCommentItem & { paperTitle: string })[] }).items
    expect(items.find((item) => item.id === rootId)).toMatchObject({ paperTitle: "虚构已上架试卷评论标题" })
    expect((await call("admin/paper-comments?state=fictional", admin.cookie)).status).toBe(400)
    expect((await call(`admin/paper-comments?q=${"虚".repeat(101)}`, admin.cookie)).status).toBe(400)
    const filtered = (await (
      await call(`admin/paper-comments?q=${encodeURIComponent("真题试卷")}`, admin.cookie)
    ).json()) as {
      items: { paperTitle: string }[]
    }
    expect(filtered.items.length).toBeGreaterThan(0)
    expect(filtered.items.every((item) => item.paperTitle.includes("真题试卷"))).toBe(true)
    expect((await call(`admin/paper-comments/${rootId}`, admin.cookie, { reason: " " }, "DELETE")).status).toBe(400)
    expect(
      (await call(`admin/paper-comments/${rootId}`, admin.cookie, { reason: "虚构删除原因" }, "DELETE")).status,
    ).toBe(200)
    const publicList = await (await call(`papers/${prefix}listed/comments`)).text()
    expect(publicList).toContain("已删除")
    expect(publicList).not.toContain("虚构上传者评论")
    const audit = (await (await call("admin/paper-comments", admin.cookie)).json()) as {
      items: { id: string; deleteReason: string; deletedBy: string; deletedAt: string }[]
    }
    expect(audit.items.find((item) => item.id === rootId)).toMatchObject({
      deleteReason: "虚构删除原因",
      deletedBy: admin.id,
    })
    const deletedState = (await (await call("admin/paper-comments?state=deleted", admin.cookie)).json()) as {
      items: { id: string }[]
    }
    expect(deletedState.items.map((item) => item.id)).toContain(rootId)
    const visibleState = (await (await call("admin/paper-comments?state=visible", admin.cookie)).json()) as {
      items: { id: string }[]
    }
    expect(visibleState.items.map((item) => item.id)).not.toContain(rootId)
    expect((await call(`admin/paper-comments/${rootId}`, admin.cookie, { reason: "改写审计" }, "DELETE")).status).toBe(
      409,
    )
    expect(
      (await call(`admin/paper-comments/${randomUUID()}`, admin.cookie, { reason: "虚构" }, "DELETE")).status,
    ).toBe(404)
    // 删除后的根评论不能再被回复。
    expect(
      (await call(`papers/${prefix}listed/comments`, owner.cookie, { body: "虚构回复已删除", parentId: rootId }))
        .status,
    ).toBe(400)
  })
})
