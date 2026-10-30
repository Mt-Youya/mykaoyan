import { randomUUID } from "node:crypto"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { AgentTokensService } from "../agent-tokens"
import { createApp } from "../app"
import { readEnvironment } from "../environment"

const TEST_ENV = {
  ...process.env,
  NODE_ENV: "test",
  PORT: "3001",
  MEDIA_SIGNING_KEY: "test-media-signing-key-at-least-32-chars",
}
const handout = {
  subjectCode: "408",
  slug: "fictional-handout-test",
  title: "虚构题面",
  position: 2,
  markdown: "# 虚构题面\n\n只发布题面，不包含答案与解析。",
}

describe("管理员讲义发布 HTTP 接口", () => {
  let app: import("@nestjs/common").INestApplication
  let origin: string
  let sql: ReturnType<typeof postgres>
  let adminId: string
  let publishToken: string
  let ordinaryToken: string

  function call(slug: string, body: unknown, token?: string) {
    return fetch(`${origin}/api/v1/publish/handouts/${slug}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
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
    await sql`insert into accounts(id,name,email,role) values(${adminId},'虚构管理员',${`${adminId}@example.invalid`},'admin')`
    const tokens = app.get(AgentTokensService)
    publishToken = (await tokens.create(adminId, "虚构发布令牌", "publish")).token
    ordinaryToken = (await tokens.create(adminId, "虚构普通令牌")).token
  })

  afterAll(async () => {
    if (sql) {
      await sql`delete from handouts where slug like 'fictional-handout%'`
      await sql`delete from accounts where id=${adminId}`
    }
    await app?.close()
    await sql?.end({ timeout: 1 })
  })

  it("缺少发布令牌返回 401，普通令牌返回 403，发布令牌可以写入", async () => {
    const slug = "fictional-handout-permission"
    const body = { ...handout, slug }
    expect((await call(slug, body)).status).toBe(401)
    expect((await call(slug, body, ordinaryToken)).status).toBe(403)
    expect((await call(slug, body, publishToken)).status).toBe(200)
  })

  it("新讲义默认下架，重复发布不写库", async () => {
    await sql`delete from handouts where slug=${handout.slug}`
    const first = await call(handout.slug, handout, publishToken)
    expect(first.status).toBe(200)
    const created = (await first.json()) as {
      slug: string
      unchanged: boolean
      listed: boolean
      contentHash: string
      updatedAt: string
    }
    expect(created).toMatchObject({ slug: handout.slug, unchanged: false, listed: false })
    expect(created.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(Number.isNaN(Date.parse(created.updatedAt))).toBe(false)
    const [row] = await sql<
      { subject_code: string; title: string; markdown: string; position: number; listed: boolean }[]
    >`select subject_code,title,markdown,position,listed from handouts where slug=${handout.slug}`
    expect(row).toMatchObject({
      subject_code: handout.subjectCode,
      title: handout.title,
      markdown: handout.markdown,
      position: handout.position,
      listed: false,
    })

    const repeated = await call(handout.slug, handout, publishToken)
    expect(repeated.status).toBe(200)
    expect(await repeated.json()).toMatchObject({
      slug: handout.slug,
      unchanged: true,
      listed: false,
      contentHash: created.contentHash,
      updatedAt: created.updatedAt,
    })
    const [count] = await sql<{ n: number }[]>`select count(*)::int as n from handouts where slug=${handout.slug}`
    expect(count?.n).toBe(1)
  })

  it("先上架再发布内容保持上架，内容变化只改内容字段", async () => {
    await sql`update handouts set listed=true where slug=${handout.slug}`
    const changed = { ...handout, title: "虚构题面（第二版）", markdown: "# 第二版\n\n沿用上架状态。" }
    const response = await call(handout.slug, changed, publishToken)
    expect(response.status).toBe(200)
    const result = (await response.json()) as { unchanged: boolean; listed: boolean; contentHash: string }
    const [row] = await sql<{ title: string; markdown: string; listed: boolean }[]>`
      select title,markdown,listed from handouts where slug=${handout.slug}`
    expect(result.unchanged).toBe(false)
    expect(result.listed).toBe(true)
    expect(row).toMatchObject({ title: changed.title, markdown: changed.markdown, listed: true })
  })

  it("路径与内容标识不一致、写上架状态、答案类标识与超长 Markdown 都返回 400", async () => {
    const other = { ...handout, slug: "fictional-handout-other" }
    expect((await call(handout.slug, other, publishToken)).status).toBe(400)
    expect((await call(handout.slug, { ...handout, listed: true }, publishToken)).status).toBe(400)
    const answerSlug = "fictional-answer-handout"
    expect((await call(answerSlug, { ...handout, slug: answerSlug }, publishToken)).status).toBe(400)
    expect((await call(handout.slug, { ...handout, markdown: "x".repeat(1_000_001) }, publishToken)).status).toBe(400)
  })
})
