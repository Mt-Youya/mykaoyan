import { z } from "zod"
import { LEGAL_VERSION } from "@mykaoyan/core"
import type { Environment } from "../../environment"

export const TERMS_VERSION = LEGAL_VERSION

/**
 * 手机号验证码登录的唯一策略来源。
 *
 * 短信模板（`CodeLength`/`ValidTime`/`CodeType`）、验证码生成（`SendSmsVerifyCode` 的
 * `##code##` 占位符）、前端输入框（`GET /api/phone/policy` 下发的 codeLength）、服务端校验
 * （`otpCodeSchema`）都从这里取值，避免四处各写一个数字。
 */
export const OTP_CODE_LENGTH = 6
export const OTP_TTL_SECONDS = 300
export const OTP_SEND_COOLDOWN_SECONDS = 60
export const OTP_SEND_WINDOW_SECONDS = 24 * 60 * 60
export const OTP_SEND_WINDOW_LIMIT = 10
export const OTP_MAX_ATTEMPTS = 5

/** 个人信息出境同意当前的政策版本；政策文案改动时同步升版（ADR 0005、PLAN §2）。 */
export const PRIVACY_POLICY_VERSION = `${LEGAL_VERSION}-local`

/** 大陆手机号：页面输入 11 位，落库与 Better Auth 用 E.164 形式。 */
export const mainlandPhoneSchema = z
  .string()
  .trim()
  .regex(/^1[3-9]\d{9}$/, "手机号格式不正确")

export const otpCodeSchema = z.string().regex(new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`), "验证码格式不正确")

export const verifyBodySchema = z.object({
  phone: mainlandPhoneSchema,
  code: otpCodeSchema,
  /** 每次登录确认当前版本；出境同意与协议确认分开提交。 */
  acceptedPolicyVersion: z.string().trim().min(1).optional(),
  acceptedTermsVersion: z.string().trim().min(1).optional(),
})

export const requestCodeBodySchema = z.object({ phone: mainlandPhoneSchema })

export type VerifyBody = z.infer<typeof verifyBodySchema>

/** 公开给前端的策略值：前端不自行写死位数、有效期与政策版本。 */
export const phoneLoginPolicy = {
  codeLength: OTP_CODE_LENGTH,
  codeTtlSeconds: OTP_TTL_SECONDS,
  cooldownSeconds: OTP_SEND_COOLDOWN_SECONDS,
  privacyPolicyVersion: PRIVACY_POLICY_VERSION,
  termsVersion: TERMS_VERSION,
} as const

/** 只返回公开地区名称，绝不把连接串、主机或项目标识传给浏览器。 */
export function phonePolicyForEnvironment(config: Pick<Environment, "DATABASE_URL" | "NODE_ENV">) {
  const host = config.DATABASE_URL ? new URL(config.DATABASE_URL).hostname : ""
  let region = "unconfirmed",
    databaseRegion = "尚未确认"
  if (config.NODE_ENV === "test" && ["localhost", "127.0.0.1"].includes(host)) {
    region = "local"
    databaseRegion = "本机测试数据库"
  } else if (/^aws-\d+-ap-northeast-1\.pooler\.supabase\.com$/.test(host)) {
    region = "tokyo"
    databaseRegion = "日本东京"
  } else if (/^aws-\d+-ap-southeast-1\.pooler\.supabase\.com$/.test(host)) {
    region = "singapore"
    databaseRegion = "新加坡"
  }
  return {
    ...phoneLoginPolicy,
    privacyPolicyVersion: `${LEGAL_VERSION}-${region}`,
    databaseRegion,
    loginEnabled: region !== "unconfirmed",
  }
}

/** 把 11 位大陆手机号转成 E.164（Better Auth 与阿里云都接受 +86 前缀的形式）。 */
export function toE164(phone: string): string {
  return `+86${mainlandPhoneSchema.parse(phone)}`
}

/** 阿里云号码认证的 PhoneNumber 参数要 11 位、不带国家码。 */
export function toAliyunPhone(e164: string): string {
  return e164.startsWith("+86") ? e164.slice(3) : e164
}

/**
 * 日志与错误信息里只出现脱敏号码，例如 `138****8000`。
 *
 * 不保留完整号码的哈希或尾号以外信息；调用方拿不到原文也算脱敏成功。
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  // E.164（+86 + 11 位）只展示大陆号码部分，避免日志里出现国家码错觉。
  const local = digits.length === 13 && digits.startsWith("86") ? digits.slice(2) : digits
  if (local.length < 7) return "***"
  return `${local.slice(0, 3)}****${local.slice(-4)}`
}
