import { createHmac } from "node:crypto"
import { Inject, Injectable } from "@nestjs/common"
import { APIError } from "better-auth/api"
import { getCookies } from "better-auth/cookies"
import type { Auth } from "../auth"
import type { AuthEnvironment } from "../environment"
import { CONFIG } from "../../config"
import type { Environment } from "../../environment"
import {
  maskPhone,
  OTP_SEND_COOLDOWN_SECONDS,
  OTP_SEND_WINDOW_LIMIT,
  OTP_SEND_WINDOW_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
  TERMS_VERSION,
  phonePolicyForEnvironment,
  requestCodeBodySchema,
  toE164,
  verifyBodySchema,
} from "../policy"
import { SMS_VERIFIER } from "../tokens"
import type { SmsVerifier } from "../sms"
import { SmsProviderError } from "../sms"
import { AUTH, AUTH_ENV, AUTH_STORES, CLOCK } from "../tokens"
import { SEND_OTP_KIND } from "../stores"
import type { AuthStores } from "../stores"

/** 服务层统一返回 problem 形状，控制器负责写状态码与 `application/problem+json`。 */
export type Problem = {
  title: string
  status: number
  code: string
  retryAfterSeconds?: number
}

export type RequestCodeResult = { ok: true; cooldownSeconds: number } | { ok: false; problem: Problem }
export type VerifyResult = { ok: true; accountId: string; setCookies: string[] } | { ok: false; problem: Problem }
export type SignOutAllResult = { ok: true; setCookies: string[] } | { ok: false; problem: Problem }
export type SignOutCurrentResult = { ok: true; setCookies: string[] } | { ok: false; problem: Problem }

const RATE_LIMITED_CODES = new Set(["BUSINESS_LIMIT_CONTROL", "FREQUENCY_FAIL", "Throttling.System"])

function invalidInput(message: string): { ok: false; problem: Problem } {
  return { ok: false, problem: { status: 400, code: "INVALID_INPUT", title: message } }
}

/**
 * 手机号验证码登录的业务层：发送（频率限制）、校验（出境同意 + 过期判定）、退出范围。
 *
 * 验证码由阿里云生成与校验，本站只保存发送时间（手机号以 HMAC 哈希记录），
 * 因此能在不接触验证码原文的前提下给出「已过期 / 填错」两种准确提示。
 */
@Injectable()
export class PhoneAuthService {
  constructor(
    @Inject(SMS_VERIFIER) private readonly sms: SmsVerifier,
    @Inject(AUTH_STORES) private readonly stores: AuthStores,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(AUTH_ENV) private readonly env: AuthEnvironment,
    @Inject(CLOCK) private readonly now: () => Date,
    @Inject(CONFIG) private readonly config: Environment
  ) {}

  policy() {
    return phonePolicyForEnvironment(this.config)
  }

  async requestCode(body: unknown): Promise<RequestCodeResult> {
    if (!this.policy().loginEnabled)
      return {
        ok: false,
        problem: { status: 503, code: "POLICY_NOT_READY", title: "数据存储位置尚未确认，暂不能登录" },
      }
    const parsed = requestCodeBodySchema.safeParse(body)
    if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message ?? "手机号格式不正确")

    const e164 = toE164(parsed.data.phone)
    const phoneHash = this.hashPhone(e164)
    const now = this.now()
    const cooldownMs = OTP_SEND_COOLDOWN_SECONDS * 1000

    const last = await this.stores.attempts.latest(phoneHash, SEND_OTP_KIND)
    if (last && now.getTime() - last.getTime() < cooldownMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((cooldownMs - (now.getTime() - last.getTime())) / 1000))
      return {
        ok: false,
        problem: {
          status: 429,
          code: "OTP_SEND_TOO_SOON",
          title: `验证码已发送，请 ${retryAfterSeconds} 秒后再试`,
          retryAfterSeconds,
        },
      }
    }

    const windowStart = new Date(now.getTime() - OTP_SEND_WINDOW_SECONDS * 1000)
    const sent = await this.stores.attempts.countSince(phoneHash, SEND_OTP_KIND, windowStart)
    if (sent >= OTP_SEND_WINDOW_LIMIT) {
      const oldest = await this.stores.attempts.oldestSince(phoneHash, SEND_OTP_KIND, windowStart)
      const retryAfterSeconds = oldest
        ? Math.max(1, Math.ceil((oldest.getTime() + OTP_SEND_WINDOW_SECONDS * 1000 - now.getTime()) / 1000))
        : OTP_SEND_WINDOW_SECONDS
      return {
        ok: false,
        problem: {
          status: 429,
          code: "OTP_SEND_DAILY_LIMIT",
          title: `短信验证码发送次数已达上限，请 ${Math.ceil(retryAfterSeconds / 60)} 分钟后再试`,
          retryAfterSeconds,
        },
      }
    }

    // 先记录再发送：失败也计入频率，避免被当成重试通道刷短信。
    await this.stores.attempts.record(phoneHash, SEND_OTP_KIND, now)
    try {
      await this.sms.sendCode(e164)
    } catch (error) {
      if (!(error instanceof SmsProviderError)) throw error
      const limited = RATE_LIMITED_CODES.has(error.code)
      return {
        ok: false,
        problem: {
          status: limited ? 429 : 502,
          code: error.code,
          title: limited ? "短信发送过于频繁，请稍后再试" : "短信发送失败，请稍后再试",
        },
      }
    }
    return { ok: true, cooldownSeconds: OTP_SEND_COOLDOWN_SECONDS }
  }

  async verify(body: unknown, headers: Headers): Promise<VerifyResult> {
    const policy = this.policy()
    if (!policy.loginEnabled)
      return {
        ok: false,
        problem: { status: 503, code: "POLICY_NOT_READY", title: "数据存储位置尚未确认，暂不能登录" },
      }
    const parsed = verifyBodySchema.safeParse(body)
    if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message ?? "参数格式不正确")

    const e164 = toE164(parsed.data.phone)
    if (parsed.data.acceptedPolicyVersion !== policy.privacyPolicyVersion) {
      return {
        ok: false,
        problem: { status: 400, code: "CONSENT_REQUIRED", title: "请阅读并单独同意当前版本的个人信息出境说明" },
      }
    }
    if (parsed.data.acceptedTermsVersion !== TERMS_VERSION) {
      return {
        ok: false,
        problem: { status: 400, code: "AGREEMENT_REQUIRED", title: "请阅读并同意当前版本的用户协议和隐私政策" },
      }
    }

    // 阿里云对「填错」和「已过期」都只回 UNKNOWN；用本站记录的发送时间判定过期，
    // 这样两种提示都准确，且不需要保存验证码原文。
    const phoneHash = this.hashPhone(e164)
    const last = await this.stores.attempts.latest(phoneHash, SEND_OTP_KIND)
    if (!last || this.now().getTime() - last.getTime() >= OTP_TTL_SECONDS * 1000) {
      return {
        ok: false,
        problem: { status: 400, code: "OTP_EXPIRED", title: "验证码已过期，请重新获取" },
      }
    }

    try {
      const result = await this.auth.api.verifyPhoneNumber({
        body: { phoneNumber: e164, code: parsed.data.code },
        headers,
        returnHeaders: true,
      })
      const user = result.response.user as { id: string }
      await this.stores.consents.record(user.id, policy.privacyPolicyVersion, this.now(), TERMS_VERSION)
      return { ok: true, accountId: user.id, setCookies: result.headers.getSetCookie() }
    } catch (error) {
      const code = this.errorCode(error)
      if (code === "INVALID_OTP") {
        return {
          ok: false,
          problem: {
            status: 400,
            code,
            title: `验证码错误，请重新输入；输错 ${OTP_MAX_ATTEMPTS} 次后需要重新获取`,
          },
        }
      }
      if (code === null) throw error
      return {
        ok: false,
        problem: { status: 502, code, title: "登录暂时不可用，请稍后再试" },
      }
    }
  }

  async signOutCurrent(headers: Headers): Promise<SignOutCurrentResult> {
    try {
      const result = await this.auth.api.signOut({ headers, returnHeaders: true })
      return { ok: true, setCookies: result.headers.getSetCookie() }
    } catch (error) {
      if (this.errorCode(error) === null) throw error
      return { ok: false, problem: { status: 400, code: "SIGN_OUT_FAILED", title: "当前设备未登录" } }
    }
  }

  /** 退出所有设备：撤销全部会话，并清空浏览器里的会话 cookie。 */
  async signOutAll(headers: Headers): Promise<SignOutAllResult> {
    try {
      await this.auth.api.revokeSessions({ headers })
    } catch (error) {
      if (this.errorCode(error) === null) throw error
      return { ok: false, problem: { status: 401, code: "UNAUTHORIZED", title: "请先登录" } }
    }
    return { ok: true, setCookies: this.clearSessionCookies() }
  }

  /** 日志里只出现脱敏号码。 */
  describePhone(e164: string): string {
    return maskPhone(e164)
  }

  private hashPhone(e164: string): string {
    return createHmac("sha256", this.env.BETTER_AUTH_SECRET).update(e164).digest("hex")
  }

  private errorCode(error: unknown): string | null {
    if (!(error instanceof APIError)) return null
    const body = error.body as { code?: string } | undefined
    return body?.code ?? "AUTH_PROVIDER_ERROR"
  }

  private clearSessionCookies(): string[] {
    const cookies = getCookies(this.auth.options)
    const targets = [cookies.sessionToken, cookies.sessionData, cookies.dontRememberToken]
    return targets.map(({ name, attributes }) => {
      const parts = [`${name}=`, `Max-Age=0`, `Path=${attributes.path ?? "/"}`]
      if (attributes.httpOnly) parts.push("HttpOnly")
      if (attributes.secure) parts.push("Secure")
      parts.push(`SameSite=${String(attributes.sameSite ?? "lax").replace(/^./, (c) => c.toUpperCase())}`)
      return parts.join("; ")
    })
  }
}
