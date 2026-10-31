import { randomInt } from "node:crypto"

import type { INestApplication } from "@nestjs/common"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../app"
import { PRIVACY_POLICY_VERSION, SMS_VERIFIER } from "../auth"
import type { MemorySmsVerifier } from "../auth"
import { readEnvironment } from "../environment"

/**
 * 用户试卷：提交、待审不可见、管理员审核、上下架守卫、答案权限与社区开关。
 *
 * 全部使用虚构题目与虚构来源说明；不写入任何真实真题内容。
 */
const TEST_ENV = {
  ...process.env,
  NODE_ENV: "test",
  PORT: "3001",
  COMMUNITY_ENABLED: "true",
  MEDIA_SIGNING_KEY: "test-media-signing-key-at-least-32-chars",
}
const phone = () => `137${randomInt(0, 100_000_000).toString().padStart(8, "0")}`
const question = {
  number: 1,
  type: "单选",
  score: 2,
  topics: ["虚构考点"],
  stemMarkdown: "虚构题面：下列哪一项是虚构选项？",
  options: [
    { label: "A", markdown: "虚构选项 A" },
    { label: "B", markdown: "虚构选项 B" },
  ],
  answerMarkdown: "虚构答案 A",
  analysisMarkdown: "虚构解析：本段文字只用于测试。",
}
const submission = {
  subjectCode: "408",
  year: 2099,
  title: "虚构用户试卷",
  sourceNote: "虚构来源：测试账号本人原创",
  rightsConfirmed: true,
  questions: [question],
}
const shortQuestion = { ...question, number: 2, type: "简答", options: null }

describe("用户试卷提交、审核与答案权限 HTTP", () => {
  let app: INestApplication, off: INestApplication
  let origin: string, offOrigin: string
  let sql: ReturnType<typeof postgres>
  let admin: { id: string; cookie: string }
  let author: { id: string; cookie: string }
  let other: { id: string; cookie: string }
  const phones: string[] = []

  const request = (base: string, method: string, path: string, cookie?: string, body?: unknown) =>
    fetch(`${base}/api/${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const get = (path: string, cookie?: string, base = origin) => request(base, "GET", path, cookie)
  const post = (path: string, cookie: string | undefined, body: unknown, base = origin) =>
    request(base, "POST", path, cookie, body)
  const put = (path: string, cookie: string | undefined, body: unknown, base = origin) =>
    request(base, "PUT", path, cookie, body)

  async function login(base: string) {
    const number = phone()
    phones.push(number)
    expect(
      (
        await fetch(`${base}/api/phone/request-code`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone: number }),
        })
      ).status,
    ).toBe(200)
    const verified = await fetch(`${base}/api/phone/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: number,
        code: (app.get(SMS_VERIFIER) as MemorySmsVerifier).peekCode(`+86${number}`),
        acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
        acceptedTermsVersion: "2026-10-30",
      }),
    })
    expect(verified.status).toBe(200)
    const cookie = verified.headers
      .getSetCookie()
      .map((value) => value.split(";")[0] ?? "")
      .find((value) => value.startsWith("better-auth.session_token="))
    expect(cookie).toBeTruthy()
    const [row] = await sql<{ id: string }[]>`select id from accounts where phone=${`+86${number}`}`
    return { id: row!.id, cookie: cookie! }
  }

  async function submit(body: unknown = submission) {
    return post("papers/submissions", author.cookie, body)
  }

  async function submittedSlug(body: unknown = submission) {
    const response = await submit(body)
    expect(response.status).toBe(201)
    return ((await response.json()) as { slug: string }).slug
  }

  beforeAll(async () => {
    const config = readEnvironment(TEST_ENV)
    const url = new URL(config.DATABASE_URL!)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test")
      throw new Error("只允许本机专用临时库")
    sql = postgres(config.DATABASE_URL!, { ssl: false, prepare: false })
    app = await createApp(config)
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
    off = await createApp(readEnvironment({ ...TEST_ENV, COMMUNITY_ENABLED: "false" }))
    await off.listen(0, "127.0.0.1")
    offOrigin = await off.getUrl()

    admin = await login(origin)
    author = await login(origin)
    other = await login(origin)
    await sql`update accounts set role='admin' where id=${admin.id}`
    await sql`delete from papers where slug like 'u-%' or slug='fictional-admin-paper'`
  })

  afterAll(async () => {
    if (sql) {
      await sql`delete from listing_changes where target_type='paper'`
      await sql`delete from papers where slug like 'u-%' or slug='fictional-admin-paper'`
      await sql`delete from accounts where phone in ${sql(phones.map((p) => `+86${p}`))}`
    }
    await app?.close()
    await off?.close()
    await sql?.end({ timeout: 1 })
  })

  it("未登录提交 401，非会员登录账号可以提交并写入待审用户试卷", async () => {
    expect((await post("papers/submissions", undefined, submission)).status).toBe(401)
    const body = (await (await submit()).json()) as {
      slug: string
      origin: string
      reviewStatus: string
      listed: boolean
      questionCount: number
    }
    expect(body).toMatchObject({ origin: "user", reviewStatus: "pending", listed: false, questionCount: 1 })
    expect(body.slug).toMatch(/^u-[0-9a-f]{12}$/)
    const [row] = await sql<
      {
        origin: string
        review_status: string
        listed: boolean
        owner_account_id: string
        position: number
        content_version: number
        content_hash: string
        rights_confirmed_at: string | null
        reviewed_at: string | null
      }[]
    >`select origin,review_status,listed,owner_account_id,position,content_version,content_hash,rights_confirmed_at,reviewed_at from papers where slug=${body.slug}`
    expect(row).toMatchObject({
      origin: "user",
      review_status: "pending",
      listed: false,
      owner_account_id: author.id,
      position: 0,
      content_version: 1,
    })
    expect(row!.content_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(row!.rights_confirmed_at).not.toBeNull()
    expect(row!.reviewed_at).toBeNull()
    const [stored] = await sql<{ n: number }[]>`
      select count(*)::int as n from paper_questions q join papers p on p.id=q.paper_id where p.slug=${body.slug}`
    expect(stored?.n).toBe(1)
  })

  it("非法题目与缺权利声明确认返回 400", async () => {
    const unordered = {
      ...submission,
      questions: [
        { ...shortQuestion, number: 1 },
        { ...question, number: 1 },
      ],
    }
    const missingOptions = { ...submission, questions: [{ ...question, options: null }] }
    const extraOptions = { ...submission, questions: [{ ...shortQuestion, options: question.options }] }
    const unconfirmed = { ...submission, rightsConfirmed: false }
    const empty = { ...submission, questions: [] }
    const tooLarge = { ...submission, questions: [{ ...shortQuestion, stemMarkdown: "虚".repeat(200_000) }] }
    const bodies = [unordered, missingOptions, extraOptions, unconfirmed, empty, tooLarge]
    const statuses = await Promise.all(bodies.map(async (body) => (await submit(body)).status))
    expect(statuses).toEqual(bodies.map(() => 400))
  })

  it("待审试卷不出现在公开列表与题面，只有本人与管理员能预览", async () => {
    const slug = await submittedSlug()
    const userList = (await (await get("papers?subject=408&origin=user")).json()) as { slug: string }[]
    expect(userList.map((item) => item.slug)).not.toContain(slug)
    const adminList = (await (await get("papers?subject=408")).json()) as { slug: string }[]
    expect(adminList.map((item) => item.slug)).not.toContain(slug)
    expect((await get(`papers/${slug}`)).status).toBe(404)
    expect((await get(`papers/${slug}/answers`)).status).toBe(401)
    expect((await get(`papers/${slug}/answers`, other.cookie)).status).toBe(404)
    expect((await get(`papers/${slug}/answers`, author.cookie)).status).toBe(200)
    expect((await get(`papers/${slug}/answers`, admin.cookie)).status).toBe(200)

    expect((await get("papers/mine", author.cookie)).status).toBe(200)
    const mine = (await (await get("papers/mine", author.cookie)).json()) as {
      enabled: boolean
      items: { slug: string; reviewStatus: string; questionCount: number }[]
    }
    expect(mine.enabled).toBe(true)
    expect(mine.items.find((item) => item.slug === slug)).toMatchObject({
      reviewStatus: "pending",
      questionCount: 1,
    })
    const otherMine = (await (await get("papers/mine", other.cookie)).json()) as { items: { slug: string }[] }
    expect(otherMine.items.map((item) => item.slug)).not.toContain(slug)
    expect((await get("papers/mine")).status).toBe(401)
    expect((await get(`papers/mine/${slug}`, other.cookie)).status).toBe(404)
    const preview = (await (await get(`papers/mine/${slug}`, author.cookie)).json()) as {
      questions: { answerMarkdown: string }[]
    }
    expect(preview.questions[0]?.answerMarkdown).toBe(question.answerMarkdown)
  })

  it("管理员审核列表区分来源与状态，非管理员 403，未登录 401", async () => {
    const slug = await submittedSlug()
    expect((await get("admin/papers")).status).toBe(401)
    expect((await get("admin/papers", author.cookie)).status).toBe(403)
    expect((await get("admin/papers?status=fictional", admin.cookie)).status).toBe(400)
    const list = (await (await get("admin/papers?status=pending", admin.cookie)).json()) as {
      items: { slug: string; origin: string; reviewStatus: string; ownerAccountId: string; author: string }[]
    }
    expect(list.items.find((item) => item.slug === slug)).toMatchObject({
      origin: "user",
      reviewStatus: "pending",
      ownerAccountId: author.id,
    })
    expect((await get(`admin/papers/${slug}`, author.cookie)).status).toBe(403)
    const detail = (await (await get(`admin/papers/${slug}`, admin.cookie)).json()) as {
      questions: { answerMarkdown: string }[]
    }
    expect(detail.questions[0]?.answerMarkdown).toBe(question.answerMarkdown)
  })

  it("驳回必须填原因，驳回后无人可见、本人可看原因并重新提交", async () => {
    const slug = await submittedSlug()
    expect((await post(`admin/papers/${slug}/review`, author.cookie, { decision: "reject" })).status).toBe(403)
    expect((await post(`admin/papers/${slug}/review`, admin.cookie, { decision: "reject" })).status).toBe(400)
    const reason = "虚构驳回原因：来源说明不足"
    const rejected = await post(`admin/papers/${slug}/review`, admin.cookie, { decision: "reject", reason })
    expect(rejected.status).toBe(201)
    expect(await rejected.json()).toMatchObject({
      slug,
      reviewStatus: "rejected",
      listed: false,
      reviewReason: reason,
    })
    expect((await get(`papers/${slug}`)).status).toBe(404)
    expect((await get(`papers/${slug}/answers`, other.cookie)).status).toBe(404)
    expect((await get(`papers/${slug}/answers`, author.cookie)).status).toBe(200)
    expect((await post(`admin/papers/${slug}/review`, admin.cookie, { decision: "approve" })).status).toBe(409)
    const mine = (await (await get("papers/mine", author.cookie)).json()) as {
      items: { slug: string; reviewStatus: string; reviewReason: string | null }[]
    }
    expect(mine.items.find((item) => item.slug === slug)).toMatchObject({
      reviewStatus: "rejected",
      reviewReason: reason,
    })
  })

  it("审核通过即上架并可公开阅读题面，答案对会员/上传者/管理员开放且不缓存", async () => {
    const slug = await submittedSlug()
    const approved = await post(`admin/papers/${slug}/review`, admin.cookie, { decision: "approve" })
    expect(approved.status).toBe(201)
    expect(await approved.json()).toMatchObject({ slug, reviewStatus: "approved", listed: true, reviewReason: null })

    const userList = (await (await get("papers?subject=408&origin=user")).json()) as {
      slug: string
      origin: string
      questionCount: number
    }[]
    expect(userList.find((item) => item.slug === slug)).toMatchObject({ origin: "user", questionCount: 1 })
    const adminList = (await (await get("papers?subject=408")).json()) as { slug: string }[]
    expect(adminList.map((item) => item.slug)).not.toContain(slug)

    const detail = (await (await get(`papers/${slug}`)).json()) as {
      origin: string
      questions: Record<string, unknown>[]
    }
    expect(detail.origin).toBe("user")
    expect(detail.questions[0]).not.toHaveProperty("answerMarkdown")
    expect(detail.questions[0]).not.toHaveProperty("analysisMarkdown")
    expect(JSON.stringify(detail)).not.toContain(question.answerMarkdown)

    expect((await get(`papers/${slug}/answers`, other.cookie)).status).toBe(403)
    const ownerAnswers = await get(`papers/${slug}/answers`, author.cookie)
    expect(ownerAnswers.status).toBe(200)
    expect(ownerAnswers.headers.get("cache-control")).toBe("no-store")
    expect((await get(`papers/${slug}/answers`, admin.cookie)).status).toBe(200)

    await sql`insert into membership_periods(account_id,starts_at,ends_at,source,reason,actor_id) values(${other.id},now()-interval '1 day',now()+interval '30 days','manual','虚构开通',${admin.id})`
    const memberAnswers = await get(`papers/${slug}/answers`, other.cookie)
    expect(memberAnswers.status).toBe(200)
    const memberBody = (await memberAnswers.json()) as { origin: string; questions: { answerMarkdown: string }[] }
    expect(memberBody).toMatchObject({ origin: "user" })
    expect(memberBody.questions[0]?.answerMarkdown).toBe(question.answerMarkdown)
  })

  it("用户试卷上下架受审核与社区开关约束，真题不受影响", async () => {
    const slug = await submittedSlug()
    expect((await put(`admin/papers/${slug}/listing`, author.cookie, { listed: true })).status).toBe(403)
    expect((await put(`admin/papers/${slug}/listing`, admin.cookie, { listed: true })).status).toBe(409)
    expect((await post(`admin/papers/${slug}/review`, admin.cookie, { decision: "approve" })).status).toBe(201)
    expect((await put(`admin/papers/${slug}/listing`, admin.cookie, { listed: false })).status).toBe(200)
    const userList = (await (await get("papers?subject=408&origin=user")).json()) as { slug: string }[]
    expect(userList.map((item) => item.slug)).not.toContain(slug)
    const [change] = await sql<{ listed: boolean; target_type: string; actor_id: string }[]>`
      select c.listed,c.target_type,c.actor_id from listing_changes c join papers p on p.id=c.target_id where p.slug=${slug} and c.target_type='paper' order by c.created_at desc limit 1`
    expect(change).toMatchObject({ listed: false, target_type: "paper", actor_id: admin.id })

    // 社区关闭时禁止上架用户试卷，但管理员真题上下架行为不变。
    expect((await put(`admin/papers/${slug}/listing`, admin.cookie, { listed: true }, offOrigin)).status).toBe(403)
    await sql`insert into papers(subject_code,year,slug,title,position,listed) values('408',2024,'fictional-admin-paper','虚构真题试卷',1,true)`
    expect(
      (await put("admin/papers/fictional-admin-paper/listing", admin.cookie, { listed: false }, offOrigin)).status,
    ).toBe(200)
    expect(
      (await put("admin/papers/fictional-admin-paper/listing", admin.cookie, { listed: true }, offOrigin)).status,
    ).toBe(200)
  })

  it("社区关闭时提交 403、公开列表为空、非本人答案 404，本人与管理员仍可预览", async () => {
    const slug = await submittedSlug()
    expect((await post(`admin/papers/${slug}/review`, admin.cookie, { decision: "approve" })).status).toBe(201)
    const closedSubmit = await post("papers/submissions", author.cookie, submission, offOrigin)
    expect(closedSubmit.status).toBe(403)
    expect(await (await get("papers?subject=408&origin=user", undefined, offOrigin)).json()).toEqual([])
    expect((await get(`papers/${slug}`, undefined, offOrigin)).status).toBe(404)
    expect((await get(`papers/${slug}/answers`, other.cookie, offOrigin)).status).toBe(404)
    expect((await get(`papers/${slug}/answers`, author.cookie, offOrigin)).status).toBe(200)
    expect((await get(`papers/${slug}/answers`, admin.cookie, offOrigin)).status).toBe(200)
    const mine = (await (await get("papers/mine", author.cookie, offOrigin)).json()) as {
      enabled: boolean
      items: { slug: string }[]
    }
    expect(mine.enabled).toBe(false)
    expect(mine.items.map((item) => item.slug)).toContain(slug)
    expect((await get("admin/papers", admin.cookie, offOrigin)).status).toBe(200)
  })
})
