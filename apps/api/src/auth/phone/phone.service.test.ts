import { describe, expect, it, vi } from "vitest"
import { APIError } from "better-auth/api"
import type { Auth } from "../auth"
import type { AuthEnvironment } from "../environment"
import { OTP_SEND_WINDOW_LIMIT, OTP_TTL_SECONDS, PRIVACY_POLICY_VERSION } from "../policy"
import { PhoneAuthService } from "./phone.service"
import { MemorySmsVerifier, SmsProviderError } from "../sms"
import type { SmsVerifier } from "../sms"
import { createMemoryStores } from "../stores"

const env: AuthEnvironment = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://127.0.0.1:3001",
  trustedOrigins: ["http://127.0.0.1:3001"],
  sms: { provider: "memory" },
}

const phone = "13800138000"

function fakeAuth(impl: () => Promise<unknown>): { auth: Auth; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn(impl)
  const auth = { api: { verifyPhoneNumber: spy } } as unknown as Auth
  return { auth, spy }
}

function setup(overrides: { auth?: Auth; sms?: SmsVerifier } = {}) {
  let now = 1_800_000_000_000
  const sms = overrides.sms ?? new MemorySmsVerifier(() => now)
  const stores = createMemoryStores()
  const auth =
    overrides.auth ?? fakeAuth(async () => ({ headers: new Headers(), response: { user: { id: "acct-1" } } })).auth
  const service = new PhoneAuthService(sms, stores, auth, env, () => new Date(now), {
    NODE_ENV: "test",
    PORT: 3001,
    COMMUNITY_ENABLED: false,
    MEDIA_SIGNING_KEY: "test-only-media-signing-key-32-chars-min",
    DATABASE_URL: "postgresql://127.0.0.1:5432/mykaoyan_test",
  })
  return {
    service,
    sms,
    stores,
    advance(seconds: number) {
      now += seconds * 1000
    },
  }
}

describe("发送验证码", () => {
  it("同一手机号 60 秒内只能发一次，并给出还要等多久", async () => {
    const { service } = setup()
    await expect(service.requestCode({ phone })).resolves.toEqual({ ok: true, cooldownSeconds: 60 })
    const second = await service.requestCode({ phone })
    expect(second.ok).toBe(false)
    if (second.ok) throw new Error("unreachable")
    expect(second.problem.status).toBe(429)
    expect(second.problem.code).toBe("OTP_SEND_TOO_SOON")
    expect(second.problem.retryAfterSeconds).toBe(60)
    expect(second.problem.title).toContain("60 秒")
  })

  it("24 小时窗口内到达上限后拒绝，并给分钟级等待", async () => {
    const { service, advance } = setup()
    for (let index = 0; index < OTP_SEND_WINDOW_LIMIT; index += 1) {
      // 顺序发送才能累计频率记录，不能用 Promise.all。
      // eslint-disable-next-line no-await-in-loop
      await expect(service.requestCode({ phone })).resolves.toMatchObject({ ok: true })
      advance(61)
    }
    const blocked = await service.requestCode({ phone })
    expect(blocked.ok).toBe(false)
    if (blocked.ok) throw new Error("unreachable")
    expect(blocked.problem.code).toBe("OTP_SEND_DAILY_LIMIT")
    expect(blocked.problem.retryAfterSeconds).toBeGreaterThan(0)
    expect(blocked.problem.title).toContain("分钟")
  })

  it("上游频控错误保留错误码并映射成 429；其它上游错误映射成 502", async () => {
    const limited = setup({
      sms: {
        sendCode: async () => Promise.reject(new SmsProviderError("BUSINESS_LIMIT_CONTROL", "x")),
        checkCode: async () => "invalid",
      },
    })
    const limitedResult = await limited.service.requestCode({ phone })
    expect(limitedResult.ok).toBe(false)
    if (!limitedResult.ok) {
      expect(limitedResult.problem.status).toBe(429)
      expect(limitedResult.problem.code).toBe("BUSINESS_LIMIT_CONTROL")
    }

    const broken = setup({
      sms: {
        sendCode: async () => Promise.reject(new SmsProviderError("MOBILE_NUMBER_ILLEGAL", "x")),
        checkCode: async () => "invalid",
      },
    })
    const brokenResult = await broken.service.requestCode({ phone })
    expect(brokenResult.ok).toBe(false)
    if (!brokenResult.ok) expect(brokenResult.problem.status).toBe(502)
  })

  it("拒绝非法手机号", async () => {
    const { service } = setup()
    const result = await service.requestCode({ phone: "12345" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem.code).toBe("INVALID_INPUT")
  })
})

describe("校验验证码", () => {
  it("首次登录未勾选出境同意不能注册，也不会调用校验", async () => {
    const { service, spy } = fakeAuthSpy()
    const sent = await service.requestCode({ phone })
    expect(sent.ok).toBe(true)
    const result = await service.verify({ phone, code: "123456" }, new Headers())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem.status).toBe(400)
      expect(result.problem.code).toBe("CONSENT_REQUIRED")
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it("验证码过期给出准确提示，不调用上游校验", async () => {
    const { auth, spy } = fakeAuth(async () => ({ headers: new Headers(), response: { user: { id: "acct-1" } } }))
    const test = setup({ auth })
    await test.service.requestCode({ phone })
    test.advance(OTP_TTL_SECONDS + 1)
    const result = await test.service.verify(
      { phone, code: "123456", acceptedPolicyVersion: PRIVACY_POLICY_VERSION, acceptedTermsVersion: "2026-10-30" },
      new Headers()
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem.code).toBe("OTP_EXPIRED")
    expect(spy).not.toHaveBeenCalled()
  })

  it("验证码错误保留 INVALID_OTP 码并提示可以重新获取", async () => {
    const { auth, spy } = fakeAuth(async () => {
      throw new APIError("BAD_REQUEST", { message: "Invalid OTP", code: "INVALID_OTP" })
    })
    const test = setup({ auth })
    await test.service.requestCode({ phone })
    const result = await test.service.verify(
      { phone, code: "000000", acceptedPolicyVersion: PRIVACY_POLICY_VERSION, acceptedTermsVersion: "2026-10-30" },
      new Headers()
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem.code).toBe("INVALID_OTP")
      expect(result.problem.title).toContain("验证码错误")
    }
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("首次登录成功后记录同意；同一账号重复同意同一版本是幂等的", async () => {
    const { auth } = fakeAuth(async () => ({
      headers: new Headers({ "set-cookie": "better-auth.session_token=abc; Path=/" }),
      response: { user: { id: "acct-1" } },
    }))
    const test = setup({ auth })
    await test.service.requestCode({ phone })
    const first = await test.service.verify(
      { phone, code: "123456", acceptedPolicyVersion: PRIVACY_POLICY_VERSION, acceptedTermsVersion: "2026-10-30" },
      new Headers()
    )
    expect(first).toMatchObject({ ok: true, accountId: "acct-1" })
    if (first.ok) expect(first.setCookies.length).toBeGreaterThan(0)
    expect(test.stores.listConsents()).toEqual([
      {
        accountId: "acct-1",
        policyVersion: PRIVACY_POLICY_VERSION,
        termsVersion: "2026-10-30",
        at: new Date(1_800_000_000_000),
      },
    ])

    // 再次登录仍须当前版本，重复记录保持幂等。

    test.advance(61)
    await test.service.requestCode({ phone })
    const second = await test.service.verify(
      { phone, code: "123456", acceptedPolicyVersion: PRIVACY_POLICY_VERSION, acceptedTermsVersion: "2026-10-30" },
      new Headers()
    )
    expect(second.ok).toBe(true)
    expect(test.stores.listConsents()).toHaveLength(1)
  })
})

function fakeAuthSpy() {
  const { auth, spy } = fakeAuth(async () => ({ headers: new Headers(), response: { user: { id: "acct-1" } } }))
  const test = setup({ auth })
  return { ...test, spy }
}
