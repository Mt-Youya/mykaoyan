import { randomInt, randomUUID } from "node:crypto"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { AgentTokensService } from "../agent-tokens"
import { createApp } from "../app"
import { PRIVACY_POLICY_VERSION, SMS_VERIFIER } from "../auth"
import type { MemorySmsVerifier } from "../auth"
import { readEnvironment } from "../environment"

const TEST_ENV = {
  ...process.env,
  NODE_ENV: "test",
  PORT: "3001",
  MEDIA_SIGNING_KEY: "test-media-signing-key-at-least-32-chars",
}
const PHONE = `139${randomInt(0, 100_000_000).toString().padStart(8, "0")}`
const question = {
  number: 1,
  type: "单选",
  score: 2,
  topics: ["线性表"],
  stemMarkdown: "虚构题面",
  options: [
    { label: "A", markdown: "选项 A" },
    { label: "B", markdown: "选项 B" },
  ],
  answerMarkdown: "答案 A",
  analysisMarkdown: "虚构解析",
}
const paper = {
  subjectCode: "408",
  year: 2024,
  slug: "fictional-paper-test",
  title: "虚构试卷",
  sourceNote: "虚构来源",
  position: 1,
  questions: [question],
}

describe("真题试卷发布与公开读取", () => {
  let app: import("@nestjs/common").INestApplication
  let origin: string
  let sql: ReturnType<typeof postgres>
  let adminId: string
  let publishToken: string
  let ordinaryToken: string
  let cookie: string
  let userAccountId: string

  function call(path: string, init: RequestInit = {}) {
    return fetch(`${origin}${path}`, init)
  }

  function publish(slug: string, body: unknown) {
    return call(`/api/v1/publish/papers/${slug}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${publishToken}` },
      body: JSON.stringify(body),
    })
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
    adminId = randomUUID()
    await sql`delete from accounts where phone=${`+86${PHONE}`}`
    await sql`insert into accounts(id,name,email,role) values(${adminId},'试卷管理员',${`${adminId}@example.invalid`},'admin')`
    publishToken = (await app.get(AgentTokensService).create(adminId, "试卷发布令牌", "publish")).token
    ordinaryToken = (await app.get(AgentTokensService).create(adminId, "试卷普通令牌")).token
    const sms = app.get(SMS_VERIFIER) as MemorySmsVerifier
    const requested = await call("/api/phone/request-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: PHONE }),
    })
    expect(requested.status).toBe(200)
    const verified = await call("/api/phone/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: PHONE,
        code: sms.peekCode(`+86${PHONE}`),
        acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
        acceptedTermsVersion: "2026-10-30",
      }),
    })
    expect(verified.status).toBe(200)
    cookie = verified.headers
      .getSetCookie()
      .map((value) => value.split(";")[0] ?? "")
      .find((value) => value.startsWith("better-auth.session_token="))!
    expect(cookie).toBeTruthy()
    const [user] = await sql<{ id: string }[]>`select id from accounts where phone=${`+86${PHONE}`}`
    userAccountId = user!.id
  })

  afterAll(async () => {
    if (sql) {
      await sql`delete from papers where slug like 'fictional-paper%'`
      await sql`delete from accounts where id=${adminId}`
      await sql`delete from accounts where phone=${PHONE}`
    }
    await app?.close()
    await sql?.end({ timeout: 1 })
  })

  it("缺少发布令牌 401，普通令牌 403，发布令牌可以写入", async () => {
    expect((await call(`/api/v1/publish/papers/${paper.slug}`, { method: "PUT", body: "{}" })).status).toBe(401)
    expect(
      (
        await call(`/api/v1/publish/papers/${paper.slug}`, {
          method: "PUT",
          headers: { "content-type": "application/json", authorization: `Bearer ${ordinaryToken}` },
          body: JSON.stringify(paper),
        })
      ).status,
    ).toBe(403)
    expect((await publish(paper.slug, paper)).status).toBe(200)
  })

  it("新试卷默认下架、版本 1，重复发布不写库", async () => {
    await sql`delete from papers where slug=${paper.slug}`
    const created = (await (await publish(paper.slug, paper)).json()) as {
      unchanged: boolean
      version: number
      listed: boolean
      contentHash: string
      questionCount: number
    }
    expect(created).toMatchObject({ unchanged: false, version: 1, listed: false, questionCount: 1 })
    expect(created.contentHash).toMatch(/^[a-f0-9]{64}$/)
    const [stored] = await sql<{ content_version: number; listed: boolean; title: string }[]>`
      select content_version,listed,title from papers where slug=${paper.slug}`
    expect(stored).toMatchObject({ content_version: 1, listed: false, title: paper.title })
    const [questions] = await sql<{ n: number }[]>`
      select count(*)::int as n from paper_questions q join papers p on p.id=q.paper_id where p.slug=${paper.slug}`
    expect(questions?.n).toBe(1)

    const repeated = (await (await publish(paper.slug, paper)).json()) as {
      unchanged: boolean
      version: number
    }
    expect(repeated).toMatchObject({ unchanged: true, version: 1 })
  })

  it("先上架再发布内容保持上架，内容变化时版本 +1", async () => {
    await sql`update papers set listed=true where slug=${paper.slug}`
    const changed = {
      ...paper,
      title: "虚构试卷（第二版）",
      questions: [{ ...question, answerMarkdown: "答案 B", analysisMarkdown: null }],
    }
    const result = (await (await publish(paper.slug, changed)).json()) as {
      unchanged: boolean
      version: number
      listed: boolean
      contentHash: string
    }
    expect(result).toMatchObject({ unchanged: false, version: 2, listed: true })
    const [stored] = await sql<{ listed: boolean; content_version: number }[]>`
      select listed,content_version from papers where slug=${paper.slug}`
    expect(stored).toMatchObject({ listed: true, content_version: 2 })
    await publish(paper.slug, paper)
  })

  it("题号非升序、选择题缺选项、非选择题带选项、slug 不一致都返回 400", async () => {
    const unordered = {
      ...paper,
      slug: "fictional-paper-unordered",
      questions: [
        { ...question, number: 2 },
        { ...question, number: 1, options: null, type: "简答" },
      ],
    }
    expect((await publish("fictional-paper-unordered", unordered)).status).toBe(400)
    const missingOptions = { ...paper, slug: "fictional-paper-missing", questions: [{ ...question, options: null }] }
    expect((await publish("fictional-paper-missing", missingOptions)).status).toBe(400)
    const extraOptions = {
      ...paper,
      slug: "fictional-paper-extra",
      questions: [{ ...question, type: "简答" }],
    }
    expect((await publish("fictional-paper-extra", extraOptions)).status).toBe(400)
    expect((await publish("fictional-paper-other", paper)).status).toBe(400)
  })

  it("公开列表与题面详情只含已上架试卷，且不返回答案字段", async () => {
    await sql`update papers set listed=true where slug=${paper.slug}`
    const hidden = { ...paper, slug: "fictional-paper-hidden", title: "未上架试卷" }
    expect((await publish(hidden.slug, hidden)).status).toBe(200)
    await sql`update papers set listed=false where slug=${hidden.slug}`
    const list = (await (await call("/api/papers?subject=408")).json()) as {
      slug: string
      questionCount: number
    }[]
    const listed = list.find((item) => item.slug === paper.slug)
    expect(listed).toMatchObject({ questionCount: 1 })
    expect(list.map((item) => item.slug)).not.toContain("fictional-paper-hidden")

    const detail = (await (await call(`/api/papers/${paper.slug}`)).json()) as {
      questions: Record<string, unknown>[]
    }
    expect(detail.questions[0]).toMatchObject({ number: 1, stemMarkdown: question.stemMarkdown })
    expect(detail.questions[0]).not.toHaveProperty("answerMarkdown")
    expect(detail.questions[0]).not.toHaveProperty("analysisMarkdown")
    expect(JSON.stringify(detail)).not.toContain(question.answerMarkdown)

    expect((await call("/api/papers/fictional-paper-hidden")).status).toBe(404)
    await sql`delete from papers where slug=${hidden.slug}`
  })

  it("答案接口未登录 401，登录但不是会员 403", async () => {
    expect((await call(`/api/papers/${paper.slug}/answers`)).status).toBe(401)
    const response = await call(`/api/papers/${paper.slug}/answers`, { headers: { cookie } })
    expect(response.status).toBe(403)
    expect(JSON.stringify(await response.json())).not.toContain(question.answerMarkdown)
  })

  it("试卷上传者本人可以看自己试卷的答案，无需会员", async () => {
    await sql`update papers set owner_account_id=${userAccountId} where slug=${paper.slug}`
    const response = await call(`/api/papers/${paper.slug}/answers`, { headers: { cookie } })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { questions: { answerMarkdown: string }[] }
    expect(body.questions[0]?.answerMarkdown).toBe(question.answerMarkdown)
    await sql`update papers set owner_account_id=null where slug=${paper.slug}`
  })

  it("有效会员可以看答案，响应不允许缓存", async () => {
    await sql`insert into membership_periods(account_id,starts_at,ends_at,source,reason,actor_id) values(${userAccountId},now()-interval '1 day',now()+interval '30 days','manual','试卷答案测试',${adminId})`
    const response = await call(`/api/papers/${paper.slug}/answers`, { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    const body = (await response.json()) as { questions: { answerMarkdown: string; analysisMarkdown: string | null }[] }
    expect(body.questions[0]).toMatchObject({
      answerMarkdown: question.answerMarkdown,
      analysisMarkdown: question.analysisMarkdown,
    })
  })
})
