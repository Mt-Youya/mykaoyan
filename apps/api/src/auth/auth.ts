import { createHmac } from "node:crypto"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"
import { phoneNumber } from "better-auth/plugins"
import { accounts, loginMethods, sessions, verificationTokens } from "@mykaoyan/db"
import type { Database } from "../database"
import type { AuthEnvironment } from "./environment"
import { OTP_CODE_LENGTH, OTP_TTL_SECONDS } from "./policy"
import type { SmsVerifier } from "./sms"

/** Better Auth 的 `database` 选项，测试可以换成内存 adapter。 */
export type BetterAuthDatabase = Parameters<typeof betterAuth>[0]["database"]

/** 会话 30 天到期，每 24 小时滑动刷新一次；刷新产生的 `Set-Cookie` 由调用方回写。 */
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24

/**
 * 创建 Better Auth 实例。
 *
 * 手机号验证码由阿里云生成与校验：`sendOTP` 只用来封掉插件自带的发送入口，
 * `verifyOTP` 转发到 `SmsVerifier`；`verification.storeInDatabase: false` 让 Better Auth
 * 不保存验证码，手机号不会落进 `verification_tokens` 表。
 */
export function createAuth(input: {
  env: AuthEnvironment
  sms: SmsVerifier
  database: BetterAuthDatabase
  /** 只为测试覆盖；默认见 SESSION_EXPIRES_IN_SECONDS / SESSION_UPDATE_AGE_SECONDS。 */
  session?: { expiresIn: number; updateAge: number }
}) {
  const { env, sms } = input
  return betterAuth({
    appName: "我的考研",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    trustedOrigins: env.trustedOrigins,
    database: input.database,
    // 表的主键是 uuid（packages/db 定义）；Better Auth 默认生成 base62 字符串，必须指定 uuid。
    advanced: { database: { generateId: "uuid" } },
    session: input.session ?? {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    verification: { storeInDatabase: false },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "account", input: false },
      },
    },
    plugins: [
      phoneNumber({
        otpLength: OTP_CODE_LENGTH,
        expiresIn: OTP_TTL_SECONDS,
        sendOTP: async () => {
          // 唯一发送入口是 POST /api/phone/request-code（频率限制 + 脱敏日志）；
          // 插件自带的 /api/auth/phone-number/send-otp 在 AuthController 里被 404。
          throw new APIError("BAD_REQUEST", {
            message: "请通过 /api/phone/request-code 获取验证码",
            code: "USE_PHONE_ENDPOINT",
          })
        },
        verifyOTP: async ({ phoneNumber: phone, code }) => (await sms.checkCode(phone, code)) === "valid",
        signUpOnVerification: {
          // Better Auth 的 user.email 必填唯一，但本站不收邮箱：用手机号的 HMAC 合成占位地址。
          // 不把手机号拼进 email —— 手机号只存 accounts.phone（PLAN §2 红线 5）。
          getTempEmail: (phone) =>
            `phone-${createHmac("sha256", env.BETTER_AUTH_SECRET).update(phone).digest("hex").slice(0, 32)}@phone.invalid`,
          getTempName: () => "考生",
        },
      }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

/** 生产/开发用：Drizzle adapter，表名与字段由 packages/db 的 accounts 域定义。 */
export function createDrizzleAuthDatabase(db: Database): BetterAuthDatabase {
  return drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: accounts,
      session: sessions,
      account: loginMethods,
      verification: verificationTokens,
    },
  })
}
