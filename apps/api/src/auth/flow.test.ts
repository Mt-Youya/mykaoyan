import "reflect-metadata"
import { Controller, Get, Module, UseGuards } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { memoryAdapter } from "better-auth/adapters/memory"
import type { MemoryDB } from "better-auth/adapters/memory"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { CONFIG } from "../config"
import type { Environment } from "../environment"
import {
  AUTH,
  AUTH_ENV,
  AUTH_STORES,
  authControllers,
  CLOCK,
  createAuth,
  MemorySmsVerifier,
  PhoneAuthService,
  readAuthEnvironment,
  SessionGuard,
  SMS_VERIFIER,
} from "."
import type { AuthEnvironment } from "."
import { PRIVACY_POLICY_VERSION } from "./policy"
import { createMemoryStores } from "./stores"
import type { MemoryAuthStores } from "./stores"

/** 模拟工单 10 的学习数据接口：必须过 SessionGuard。 */
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

const config: Environment = {
  NODE_ENV: "test",
  COMMUNITY_ENABLED: false,
  PORT: 3001,
  DATABASE_URL: "postgresql://127.0.0.1:5432/mykaoyan_test",
  MEDIA_SIGNING_KEY: "test-only-media-signing-key-32-chars-min",
}

let app: Awaited<ReturnType<typeof NestFactory.create>>
let origin = ""
let now = 1_800_000_000_000

async function post(path: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (cookie) headers.cookie = cookie
  return fetch(`${origin}${path}`, { method: "POST", headers, body: JSON.stringify(body) })
}

async function get(path: string, cookie?: string) {
  return fetch(`${origin}${path}`, { headers: cookie ? { cookie } : {} })
}

async function sessionCookieOf(response: Response): Promise<string> {
  const match = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0] ?? "")
    .find((value) => value.startsWith("better-auth.session_token="))
  if (!match) throw new Error("响应没有会话 cookie")
  return match
}

function stores(): MemoryAuthStores {
  return app.get(AUTH_STORES) as MemoryAuthStores
}

function sms(): MemorySmsVerifier {
  return app.get(SMS_VERIFIER) as MemorySmsVerifier
}

async function requestCode(phone: string) {
  return post("/api/phone/request-code", { phone })
}

async function login(phone: string) {
  now += 61_000
  const sent = await requestCode(phone)
  expect(sent.status).toBe(200)
  const response = await post("/api/phone/verify", {
    phone,
    code: sms().peekCode(`+86${phone}`),
    acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
    acceptedTermsVersion: "2026-10-30",
  })
  expect(response.status).toBe(200)
  return { cookie: await sessionCookieOf(response), body: (await response.json()) as { accountId: string } }
}

describe("手机号验证码登录 HTTP 链路（内存短信 + 内存 store）", () => {
  beforeAll(async () => {
    // 内存 adapter + 内存 store：HTTP 层行为测试不连数据库、不发真实短信。
    const memory: MemoryDB = { user: [], session: [], account: [], verification: [] }
    const env: AuthEnvironment = readAuthEnvironment(process.env, config.NODE_ENV)
    const smsVerifier = new MemorySmsVerifier()
    const memoryStores = createMemoryStores()
    app = await NestFactory.create(
      {
        module: ProbeModule,
        controllers: [...authControllers, ProtectedProbeController],
        providers: [
          { provide: CONFIG, useValue: config },
          { provide: AUTH_ENV, useValue: env },
          { provide: SMS_VERIFIER, useValue: smsVerifier },
          { provide: AUTH_STORES, useValue: memoryStores },
          { provide: AUTH, useValue: createAuth({ env, sms: smsVerifier, database: memoryAdapter(memory) }) },
          { provide: CLOCK, useValue: () => new Date(now) },
          PhoneAuthService,
          SessionGuard,
        ],
      },
      { logger: false },
    )
    app.setGlobalPrefix("api")
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
  })

  afterAll(async () => {
    await app?.close()
  })

  it("协议与出境同意分别校验，新旧账号都不能用缺失或旧版同意登录", async () => {
    const phone = "13600002401"
    expect((await requestCode(phone)).status).toBe(200)
    const code = sms().peekCode(`+86${phone}`)
    const missingTerms = await post("/api/phone/verify", { phone, code, acceptedPolicyVersion: PRIVACY_POLICY_VERSION })
    expect(missingTerms.status).toBe(400)
    expect(((await missingTerms.json()) as { code: string }).code).toBe("AGREEMENT_REQUIRED")
    expect(missingTerms.headers.getSetCookie()).toEqual([])
    const oldTerms = await post("/api/phone/verify", {
      phone,
      code,
      acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
      acceptedTermsVersion: "2026-10-27",
    })
    expect(oldTerms.status).toBe(400)
    expect(((await oldTerms.json()) as { code: string }).code).toBe("AGREEMENT_REQUIRED")
    const oldTransfer = await post("/api/phone/verify", {
      phone,
      code,
      acceptedPolicyVersion: "2026-10-27",
      acceptedTermsVersion: "2026-10-30",
    })
    expect(oldTransfer.status).toBe(400)
    expect(((await oldTransfer.json()) as { code: string }).code).toBe("CONSENT_REQUIRED")
    const complete = { phone, code, acceptedPolicyVersion: PRIVACY_POLICY_VERSION, acceptedTermsVersion: "2026-10-30" }
    const created = await post("/api/phone/verify", complete)
    expect(created.status).toBe(200)
    const accountId = ((await created.json()) as { accountId: string }).accountId
    expect(stores().listConsents()).toEqual([
      { accountId, policyVersion: PRIVACY_POLICY_VERSION, termsVersion: "2026-10-30", at: new Date(now) },
    ])
    now += 61_000
    expect((await requestCode(phone)).status).toBe(200)
    const returning = await post("/api/phone/verify", {
      phone,
      code: sms().peekCode(`+86${phone}`),
      acceptedTermsVersion: "2026-10-30",
    })
    expect(returning.status).toBe(400)
    expect(((await returning.json()) as { code: string }).code).toBe("CONSENT_REQUIRED")
  })

  it("出境告知按实际连接地区下发，未知地区暂停登录且不泄露连接信息", async () => {
    const previous = config.DATABASE_URL
    try {
      for (const [region, label, suffix] of [
        ["ap-northeast-1", "日本东京", "tokyo"],
        ["ap-southeast-1", "新加坡", "singapore"],
      ]) {
        config.DATABASE_URL = `postgresql://fictional:secret@aws-0-${region}.pooler.supabase.com:6543/postgres`
        const response = await get("/api/phone/policy")
        const body = (await response.json()) as Record<string, unknown>
        expect(body.databaseRegion).toBe(label)
        expect(body.privacyPolicyVersion).toBe(`2026-10-30-${suffix}`)
        expect(body.loginEnabled).toBe(true)
        expect(JSON.stringify(body)).not.toMatch(/fictional|secret|pooler/)
      }
      config.DATABASE_URL = "postgresql://fictional:secret@unconfirmed.invalid/postgres"
      const policy = await get("/api/phone/policy")
      expect(await policy.json()).toMatchObject({ loginEnabled: false, databaseRegion: "尚未确认" })
      const blocked = await requestCode("13600002402")
      expect(blocked.status).toBe(503)
      const direct = await post("/api/phone/verify", {
        phone: "13600002402",
        code: "123456",
        acceptedPolicyVersion: "2026-10-30-unconfirmed",
        acceptedTermsVersion: "2026-10-30",
      })
      expect(direct.status).toBe(503)
    } finally {
      config.DATABASE_URL = previous
    }
  })

  it("策略接口下发的位数、有效期、冷却与政策版本是唯一来源", async () => {
    const response = await get("/api/phone/policy")
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      codeLength: 6,
      codeTtlSeconds: 300,
      cooldownSeconds: 60,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    })
  })

  it("拒绝格式不对的手机号", async () => {
    const response = await requestCode("12345")
    expect(response.status).toBe(400)
    expect(response.headers.get("content-type")).toContain("application/problem+json")
    expect(((await response.json()) as { code: string }).code).toBe("INVALID_INPUT")
  })

  it("同一手机号 60 秒内第二次发送被拒，并告诉用户还要等多久", async () => {
    expect((await requestCode("13900139000")).status).toBe(200)
    const second = await requestCode("13900139000")
    expect(second.status).toBe(429)
    expect(second.headers.get("retry-after")).toBe("60")
    const body = (await second.json()) as { code: string; title: string }
    expect(body.code).toBe("OTP_SEND_TOO_SOON")
    expect(body.title).toContain("秒")
  })

  it("首次登录未勾选出境同意不能注册；勾选后可以注册并记录同意", async () => {
    now += 61_000
    expect((await requestCode("13700137000")).status).toBe(200)

    const withoutConsent = await post("/api/phone/verify", { phone: "13700137000", code: "123456" })
    expect(withoutConsent.status).toBe(400)
    expect(((await withoutConsent.json()) as { code: string }).code).toBe("CONSENT_REQUIRED")

    const wrongCode = await post("/api/phone/verify", {
      phone: "13700137000",
      code: "000000",
      acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
      acceptedTermsVersion: "2026-10-30",
    })
    expect(wrongCode.status).toBe(400)
    expect(((await wrongCode.json()) as { code: string }).code).toBe("INVALID_OTP")

    const correctCode = sms().peekCode("+8613700137000")
    const created = await post("/api/phone/verify", {
      phone: "13700137000",
      code: correctCode,
      acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
      acceptedTermsVersion: "2026-10-30",
    })
    expect(created.status).toBe(200)
    const accountId = ((await created.json()) as { accountId: string }).accountId
    expect(stores().listConsents()).toContainEqual({
      accountId,
      policyVersion: PRIVACY_POLICY_VERSION,
      termsVersion: "2026-10-30",
      at: new Date(now),
    })
  })

  it("未登录访问学习数据接口返回 401，登录后可以访问", async () => {
    const unauthorized = await get("/api/progress")
    expect(unauthorized.status).toBe(401)

    const { cookie } = await login("13600136000")
    const authorized = await get("/api/progress", cookie)
    expect(authorized.status).toBe(200)
    expect(await authorized.json()).toEqual({ ok: true })
  })

  it("Better Auth 原生端点可用，但插件自带的验证码端点被封锁（防止绕过频率限制与同意）", async () => {
    const blocked = await post("/api/auth/phone-number/send-otp", { phoneNumber: "+8613800138000" })
    expect(blocked.status).toBe(404)
    expect(((await blocked.json()) as { code: string }).code).toBe("ENDPOINT_DISABLED")

    const { cookie } = await login("13500135000")
    const session = await get("/api/auth/get-session", cookie)
    expect(session.status).toBe(200)
    const body = (await session.json()) as { user: { id: string } }
    expect(body.user.id).toBeTruthy()
  })

  it("退出当前设备只清掉本次会话", async () => {
    const { cookie } = await login("13400134000")
    expect((await get("/api/auth/get-session", cookie)).status).toBe(200)

    const signOut = await post("/api/phone/sign-out", {}, cookie)
    expect(signOut.status).toBe(200)
    expect(signOut.headers.getSetCookie().some((value) => value.includes("Max-Age=0"))).toBe(true)

    const after = await get("/api/auth/get-session", cookie)
    expect(await after.json()).toBeNull()
  })

  it("退出所有设备会撤销同一账号的全部会话", async () => {
    const phone = "13300133000"
    const first = await login(phone)
    const second = await login(phone)
    expect((await get("/api/progress", first.cookie)).status).toBe(200)
    expect((await get("/api/progress", second.cookie)).status).toBe(200)

    const signOutAll = await post("/api/phone/sign-out-all", {}, second.cookie)
    expect(signOutAll.status).toBe(200)
    expect(((await signOutAll.json()) as { signedOut: string }).signedOut).toBe("all")

    expect(await (await get("/api/auth/get-session", first.cookie)).json()).toBeNull()
    expect(await (await get("/api/auth/get-session", second.cookie)).json()).toBeNull()
  })
})
