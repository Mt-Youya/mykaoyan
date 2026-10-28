import { randomInt } from "node:crypto"
import { OTP_CODE_LENGTH, OTP_TTL_SECONDS } from "../policy"

/**
 * 短信验证码提供方。发送与校验是两件事：验证码由提供方生成并校验，本站只决定
 * 位数与有效期（见 policy.ts），不保存验证码原文。
 */
export interface SmsVerifier {
  /** 发送一条新验证码；返回提供方的请求标识（只用于日志/排障，不含验证码）。 */
  sendCode(e164Phone: string): Promise<{ requestId: string }>
  /** 校验验证码；`invalid` 覆盖「填错」与「提供方判为失败」两种情况。 */
  checkCode(e164Phone: string, code: string): Promise<"valid" | "invalid">
}

/** 上游短信提供方返回的错误；保留上游错误码，不压成通用提示。 */
export class SmsProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502
  ) {
    super(message)
    this.name = "SmsProviderError"
  }
}

/**
 * 测试与本地开发用的内存实现：不发短信，只把验证码记在进程里。
 *
 * `NODE_ENV=test` 时由 auth/index.ts 强制选用；`peekCode` 只给测试读取，不出现在任何接口里。
 */
export class MemorySmsVerifier implements SmsVerifier {
  private readonly codes = new Map<string, { code: string; expiresAt: number }>()
  private counter = 0

  constructor(private readonly now: () => number = Date.now) {}

  async sendCode(e164Phone: string): Promise<{ requestId: string }> {
    const code = String(randomInt(0, 10 ** OTP_CODE_LENGTH)).padStart(OTP_CODE_LENGTH, "0")
    this.codes.set(e164Phone, { code, expiresAt: this.now() + OTP_TTL_SECONDS * 1000 })
    this.counter += 1
    return { requestId: `memory-${this.counter}` }
  }

  async checkCode(e164Phone: string, code: string): Promise<"valid" | "invalid"> {
    const entry = this.codes.get(e164Phone)
    if (!entry) return "invalid"
    if (this.now() >= entry.expiresAt) {
      this.codes.delete(e164Phone)
      return "invalid"
    }
    if (entry.code !== code) return "invalid"
    this.codes.delete(e164Phone)
    return "valid"
  }

  /** 测试专用：读出当前验证码。生产实现没有这个能力，也不会返回验证码。 */
  peekCode(e164Phone: string): string | undefined {
    return this.codes.get(e164Phone)?.code
  }
}
