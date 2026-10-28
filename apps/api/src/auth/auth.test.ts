import "reflect-metadata"
import { Controller, Get, Module, UseGuards } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  AUTH,
  AUTH_ENV,
  AUTH_STORES,
  AuthController,
  CLOCK,
  MemorySmsVerifier,
  PhoneAuthService,
  PhoneController,
  SMS_VERIFIER,
  SessionGuard,
  createAuth,
  createDrizzleAuthDatabase,
  createDrizzleStores,
  readAuthEnvironment,
  PRIVACY_POLICY_VERSION,
} from "./index"
import type { AuthEnvironment } from "./index"
import { CONFIG } from "../config"
import { DatabaseService } from "../database"
import { readEnvironment } from "../environment"
import type { Environment } from "../environment"

/**
 * 真实 Postgres 路径：Drizzle store + Drizzle adapter + 迁移后的真实表。
 *
 * 只在显式提供测试库时运行；本机用 `/tmp/mk-api-test.sh` 起干净临时库并重放迁移。
 */
const databaseUrl = process.env.DATABASE_URL
const enabled = databaseUrl !== undefined && databaseUrl.includes("mykaoyan_test")

const TEST_ENV = {
  ...process.env,
  NODE_ENV: "test",
  PORT: "3001",
  MEDIA_SIGNING_KEY: "test-only-media-signing-key-32-chars-min",
}

@Controller("progress")
class ProtectedProbeController {
  @Get()
  @UseGuards(SessionGuard)
  read() {
    return { ok: true }
  }
}

@Module({})
class ProbeModule {}

let app: Awaited<ReturnType<typeof NestFactory.create>>
let origin = ""
let config: Environment
let sql: ReturnType<typeof postgres>
let database: DatabaseService
let now = 1_800_000_000_000

function sms(): MemorySmsVerifier {
  return app.get(SMS_VERIFIER) as MemorySmsVerifier
}

async function post(path: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (cookie) headers.cookie = cookie
  return fetch(`${origin}${path}`, { method: "POST", headers, body: JSON.stringify(body) })
}

async function sessionCookieOf(response: Response): Promise<string> {
  const match = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0] ?? "")
    .find((value) => value.startsWith("better-auth.session_token="))
  if (!match) throw new Error("响应没有会话 cookie")
  return match
}

async function login(phone: string) {
  now += 61_000
  const sent = await post("/api/phone/request-code", { phone })
  expect(sent.status).toBe(200)
  const verified = await post("/api/phone/verify", {
    phone,
    code: sms().peekCode(`+86${phone}`),
    acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
  })
  expect(verified.status).toBe(200)
  return { cookie: await sessionCookieOf(verified), body: (await verified.json()) as { accountId: string } }
}

describe.runIf(enabled)("手机号登录（真实 Postgres）", () => {
  beforeAll(async () => {
    config = readEnvironment(TEST_ENV)
    const url = new URL(config.DATABASE_URL!)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test") {
      throw new Error("集成测试只允许专用的本机 mykaoyan_test 临时库")
    }
    sql = postgres(config.DATABASE_URL!, { prepare: false, ssl: false })
    await sql`delete from personal_info_transfer_consents`
    await sql`delete from sessions`
    await sql`delete from login_methods`
    await sql`delete from accounts`
    await sql`delete from phone_login_attempts`

    database = new DatabaseService(config)
    const stores = createDrizzleStores(database.db)
    const env: AuthEnvironment = readAuthEnvironment(process.env, config.NODE_ENV)
    const smsVerifier = new MemorySmsVerifier()
    const auth = createAuth({ env, sms: smsVerifier, database: createDrizzleAuthDatabase(database.db) })

    app = await NestFactory.create(
      {
        module: ProbeModule,
        controllers: [AuthController, PhoneController, ProtectedProbeController],
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
        ],
      },
      { logger: false }
    )
    app.setGlobalPrefix("api")
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
  })

  afterAll(async () => {
    await app?.close()
    await database?.onModuleDestroy()
    await sql?.end({ timeout: 1 })
  })

  it("首次登录即注册：写账号、手机号只在 phone 列，并记录出境同意", async () => {
    const { body } = await login("13800138000")
    const [account] = await sql<
      { id: string; phone: string; email: string; role: string }[]
    >`select id, phone, email, role from accounts where id = ${body.accountId}`
    expect(account?.phone).toBe("+8613800138000")
    expect(account?.role).toBe("account")
    expect(account?.email).not.toContain("13800138000")
    expect(account?.email).toMatch(/^phone-[0-9a-f]{32}@phone\.invalid$/)

    const consents = await sql<{ policy_version: string }[]>`
      select policy_version from personal_info_transfer_consents where account_id = ${body.accountId}`
    expect(consents).toEqual([{ policy_version: PRIVACY_POLICY_VERSION }])

    const sessions = await sql<{ account_id: string }[]>`
      select account_id from sessions where account_id = ${body.accountId}`
    expect(sessions).toHaveLength(1)
  })

  it("同一手机号第二次登录命中已有账号，不新增账号", async () => {
    const [before] = await sql<{ count: string }[]>`select count(*)::text as count from accounts`
    const second = await login("13800138000")
    const [after] = await sql<{ count: string }[]>`select count(*)::text as count from accounts`
    expect(after?.count).toBe(before?.count)
    const rows = await sql<{ id: string }[]>`select id from accounts where phone = '+8613800138000'`
    expect(rows).toHaveLength(1)
    expect(second.body.accountId).toBe(rows[0]?.id)
  })

  it("重复记录同一政策版本的同意是幂等的（唯一约束不报 500）", async () => {
    const [account] = await sql<{ id: string }[]>`select id from accounts where phone = '+8613800138000'`
    const stores = app.get(AUTH_STORES) as ReturnType<typeof createDrizzleStores>
    await stores.consents.record(account!.id, PRIVACY_POLICY_VERSION, new Date(now))
    await stores.consents.record(account!.id, PRIVACY_POLICY_VERSION, new Date(now))
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count from personal_info_transfer_consents where account_id = ${account!.id}`
    expect(rows[0]?.count).toBe("1")
  })

  it("未勾选出境同意时新手机号不能注册", async () => {
    const [before] = await sql<{ count: string }[]>`select count(*)::text as count from accounts`
    now += 61_000
    await post("/api/phone/request-code", { phone: "13900139000" })
    const verified = await post("/api/phone/verify", { phone: "13900139000", code: sms().peekCode("+8613900139000") })
    expect(verified.status).toBe(400)
    expect(((await verified.json()) as { code: string }).code).toBe("CONSENT_REQUIRED")
    const [after] = await sql<{ count: string }[]>`select count(*)::text as count from accounts`
    expect(after?.count).toBe(before?.count)
  })

  it("数据库唯一约束拒绝重复手机号", async () => {
    const duplicate = sql`insert into accounts (name, email, phone) values ('dup', 'dup@phone.invalid', '+8613800138000')`
    await expect(duplicate).rejects.toThrow()
  })

  it("退出当前设备只删本次会话；退出所有设备删掉剩余会话", async () => {
    const first = await login("13700137000")
    const second = await login("13700137000")
    expect((await post("/api/phone/sign-out", {}, first.cookie)).status).toBe(200)
    const [left] = await sql<{ count: string }[]>`
      select count(*)::text as count from sessions where account_id = ${second.body.accountId}`
    expect(left?.count).toBe("1")

    const all = await post("/api/phone/sign-out-all", {}, second.cookie)
    expect(all.status).toBe(200)
    const [remaining] = await sql<{ count: string }[]>`
      select count(*)::text as count from sessions where account_id = ${second.body.accountId}`
    expect(remaining?.count).toBe("0")
  })

  it("未登录访问学习数据接口返回 401，登录后 200", async () => {
    expect((await fetch(`${origin}/api/progress`)).status).toBe(401)
    const { cookie } = await login("13600136000")
    expect((await fetch(`${origin}/api/progress`, { headers: { cookie } })).status).toBe(200)
  })
})
