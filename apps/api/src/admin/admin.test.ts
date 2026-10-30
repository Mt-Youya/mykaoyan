import "reflect-metadata"
import { Module } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  AUTH,
  AUTH_ENV,
  AUTH_STORES,
  AuthController,
  CLOCK,
  createAuth,
  createDrizzleAuthDatabase,
  createDrizzleStores,
  MemorySmsVerifier,
  PhoneAuthService,
  PhoneController,
  PRIVACY_POLICY_VERSION,
  readAuthEnvironment,
  SessionGuard,
  SMS_VERIFIER,
} from "../auth"
import type { AuthEnvironment } from "../auth"
import { CATALOG_READER, CatalogController, CatalogService } from "../catalog"
import { ProblemFilter } from "../common"
import { CONFIG } from "../config"
import { DatabaseService } from "../database"
import { readEnvironment } from "../environment"
import type { Environment } from "../environment"
import { ListingController, ListingService } from "./index"

/**
 * 上下架权限矩阵与审计记录（真实 Postgres + Drizzle 会话）。
 *
 * `createApplication` 在 `NODE_ENV=test` 时用内存认证仓库，账号不会落到数据库；
 * 这里按 auth.test.ts 的方式直接组装真实 Drizzle 认证，才能验证「提权后立刻生效」。
 */
const databaseUrl = process.env.DATABASE_URL
const enabled = databaseUrl !== undefined && databaseUrl.includes("mykaoyan_test")

const TEST_ENV = {
  ...process.env,
  NODE_ENV: "test",
  PORT: "3001",
  MEDIA_SIGNING_KEY: "test-only-media-signing-key-32-chars-min",
}

const PHONE = "13800138000"

@Module({})
class ProbeModule {}

describe.runIf(enabled)("管理员上下架", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>
  let origin = ""
  let config: Environment
  let sql: ReturnType<typeof postgres>
  let database: DatabaseService
  let now = 1_800_000_000_000
  let accountCookie = ""

  const put = (slug: string, body: unknown, cookie?: string) =>
    fetch(`${origin}/api/admin/lessons/${slug}/listing`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })

  async function login(phone: string) {
    const sms = app.get(SMS_VERIFIER) as MemorySmsVerifier
    now += 61_000
    const requested = await fetch(`${origin}/api/phone/request-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone }),
    })
    expect(requested.status).toBe(200)
    const verified = await fetch(`${origin}/api/phone/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone,
        code: sms.peekCode(`+86${phone}`),
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
    return cookie!
  }

  async function cleanup() {
    const client = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: false })
    try {
      await client`delete from listing_changes`
      await client`delete from sessions`
      await client`delete from login_methods`
      await client`delete from personal_info_transfer_consents`
      await client`delete from phone_login_attempts`
      await client`delete from accounts`
      await client`delete from lessons where slug = 'admin-lesson'`
      await client`delete from handouts where slug = 'admin-handout'`
      await client`delete from chapters where title = '上下架示例章'`
      await client`delete from courses where slug = 'admin-course'`
    } finally {
      await client.end({ timeout: 1 })
    }
  }

  beforeAll(async () => {
    config = readEnvironment(TEST_ENV)
    const url = new URL(config.DATABASE_URL!)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test") {
      throw new Error("集成测试只允许专用的本机 mykaoyan_test 临时库")
    }
    sql = postgres(config.DATABASE_URL!, { prepare: false, ssl: false })
    await cleanup()

    const [course] = await sql<{ id: string }[]>`
      insert into courses (subject_code, slug, title, summary, position, listed)
      values ('408', 'admin-course', '上下架示例课程', '虚构', 1, true) returning id`
    const [chapter] = await sql<{ id: string }[]>`
      insert into chapters (course_id, title, position, listed)
      values (${course!.id}, '上下架示例章', 1, true) returning id`
    await sql`
      insert into lessons (chapter_id, slug, title, position, video_key, script_markdown, listed)
      values (${chapter!.id}, 'admin-lesson', '上下架示例讲', 1, 'videos/admin.mp4', '# 讲稿', true)`
    await sql`
      insert into handouts (subject_code, slug, title, markdown, position, listed)
      values ('408', 'admin-handout', '上下架示例讲义', '# 讲义', 1, true)`

    database = new DatabaseService(config)
    const stores = createDrizzleStores(database.db)
    const env: AuthEnvironment = readAuthEnvironment(process.env, config.NODE_ENV)
    const smsVerifier = new MemorySmsVerifier()
    const auth = createAuth({ env, sms: smsVerifier, database: createDrizzleAuthDatabase(database.db) })

    app = await NestFactory.create(
      {
        module: ProbeModule,
        controllers: [CatalogController, ListingController, AuthController, PhoneController],
        providers: [
          { provide: CONFIG, useValue: config },
          { provide: DatabaseService, useValue: database },
          { provide: AUTH_ENV, useValue: env },
          { provide: SMS_VERIFIER, useValue: smsVerifier },
          { provide: AUTH_STORES, useValue: stores },
          { provide: AUTH, useValue: auth },
          { provide: CLOCK, useValue: () => new Date(now) },
          PhoneAuthService,
          SessionGuard,
          CatalogService,
          { provide: CATALOG_READER, useExisting: CatalogService },
          ListingService,
        ],
      },
      { logger: false },
    )
    app.setGlobalPrefix("api")
    app.useGlobalFilters(new ProblemFilter(app.getHttpAdapter()))
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
    accountCookie = await login(PHONE)
  })

  afterAll(async () => {
    await cleanup()
    await app?.close()
    await database?.onModuleDestroy()
    await sql?.end({ timeout: 1 })
  })

  it("访客返回 401，且不改变上架状态", async () => {
    const response = await put("admin-lesson", { listed: false })
    expect(response.status).toBe(401)
    expect(response.headers.get("content-type")).toContain("application/problem+json")
    const [row] = await sql<{ listed: boolean }[]>`select listed from lessons where slug = 'admin-lesson'`
    expect(row!.listed).toBe(true)
  })

  it("普通账号返回 403，且不改变上架状态、不写记录", async () => {
    const response = await put("admin-lesson", { listed: false }, accountCookie)
    expect(response.status).toBe(403)
    const [row] = await sql<{ listed: boolean }[]>`select listed from lessons where slug = 'admin-lesson'`
    expect(row!.listed).toBe(true)
    expect(await sql`select id from listing_changes`).toHaveLength(0)
  })

  it("管理员下架后留下记录，且访客立刻看不到", async () => {
    await sql`update accounts set role = 'admin'`
    const [lesson] = await sql<{ id: string }[]>`select id from lessons where slug = 'admin-lesson'`

    const response = await put("admin-lesson", { listed: false }, accountCookie)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ targetType: "lesson", slug: "admin-lesson", listed: false })

    const [after] = await sql<{ listed: boolean }[]>`select listed from lessons where slug = 'admin-lesson'`
    expect(after!.listed).toBe(false)

    const [change] = await sql<{ actor_id: string; listed: boolean; target_type: string }[]>`
      select actor_id, listed, target_type from listing_changes where target_id = ${lesson!.id}`
    expect(change).toMatchObject({ listed: false, target_type: "lesson" })
    expect(change!.actor_id).toBeTruthy()

    expect((await fetch(`${origin}/api/lessons/admin-lesson`)).status).toBe(404)
    const detail = (await (await fetch(`${origin}/api/courses/admin-course`)).json()) as {
      chapters: { lessons: unknown[] }[]
    }
    expect(detail.chapters[0]!.lessons).toHaveLength(0)
  })

  it("管理员重新上架后访客又能看到", async () => {
    expect((await put("admin-lesson", { listed: true }, accountCookie)).status).toBe(200)
    expect((await fetch(`${origin}/api/lessons/admin-lesson`)).status).toBe(200)
    const changes = await sql<{ listed: boolean }[]>`select listed from listing_changes order by created_at, id`
    expect(changes.map((row) => row.listed)).toEqual([false, true])
  })

  it("讲义同样可以上下架", async () => {
    const response = await fetch(`${origin}/api/admin/handouts/admin-handout/listing`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: accountCookie },
      body: JSON.stringify({ listed: false }),
    })
    expect(response.status).toBe(200)
    expect((await fetch(`${origin}/api/handouts/admin-handout`)).status).toBe(404)
  })

  it("非法请求体与不存在的 slug 分别返回 400 与 404", async () => {
    expect((await put("admin-lesson", { listed: "yes" }, accountCookie)).status).toBe(400)
    expect((await put("admin-lesson", {}, accountCookie)).status).toBe(400)
    expect((await put("no-such-lesson", { listed: true }, accountCookie)).status).toBe(404)
  })
})
