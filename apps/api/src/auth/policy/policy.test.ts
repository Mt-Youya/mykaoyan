import { describe, expect, it } from "vitest"
import {
  mainlandPhoneSchema,
  maskPhone,
  OTP_CODE_LENGTH,
  otpCodeSchema,
  phoneLoginPolicy,
  PRIVACY_POLICY_VERSION,
  toAliyunPhone,
  toE164,
  verifyBodySchema,
} from "./policy"
import { MemorySmsVerifier } from "../sms"

describe("手机号与验证码策略（单一来源）", () => {
  it("验证码位数只有一处定义，6 位数字", () => {
    expect(OTP_CODE_LENGTH).toBe(6)
    expect(phoneLoginPolicy.codeLength).toBe(6)
    expect(otpCodeSchema.safeParse("123456").success).toBe(true)
    expect(otpCodeSchema.safeParse("12345").success).toBe(false)
    expect(otpCodeSchema.safeParse("1234567").success).toBe(false)
    expect(otpCodeSchema.safeParse("12345a").success).toBe(false)
  })

  it("只接受 11 位大陆手机号，并转成 E.164 / 阿里云格式", () => {
    expect(mainlandPhoneSchema.safeParse("13800138000").success).toBe(true)
    expect(mainlandPhoneSchema.safeParse("+8613800138000").success).toBe(false)
    expect(mainlandPhoneSchema.safeParse("12800138000").success).toBe(false)
    expect(toE164("13800138000")).toBe("+8613800138000")
    expect(toAliyunPhone("+8613800138000")).toBe("13800138000")
  })

  it("日志脱敏保留前三位与后四位", () => {
    expect(maskPhone("+8613800138000")).toBe("138****8000")
    expect(maskPhone("13800138000")).toBe("138****8000")
    expect(maskPhone("123")).toBe("***")
  })

  it("注册请求必须带当前政策版本；已注册账号可以不带", () => {
    expect(verifyBodySchema.safeParse({ phone: "13800138000", code: "123456" }).success).toBe(true)
    expect(
      verifyBodySchema.parse({ phone: "13800138000", code: "123456", acceptedPolicyVersion: PRIVACY_POLICY_VERSION })
    ).toMatchObject({ acceptedPolicyVersion: PRIVACY_POLICY_VERSION })
  })
})

describe("内存短信实现（测试专用）", () => {
  it("发出的验证码只接受一次，过期后不能再用", async () => {
    let now = 1_800_000_000_000
    const sms = new MemorySmsVerifier(() => now)
    await sms.sendCode("+8613800138000")
    const code = sms.peekCode("+8613800138000")
    expect(code).toMatch(new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`))
    expect(await sms.checkCode("+8613800138000", "000000")).toBe("invalid")
    expect(await sms.checkCode("+8613800138000", code!)).toBe("valid")
    expect(await sms.checkCode("+8613800138000", code!)).toBe("invalid")

    await sms.sendCode("+8613800138001")
    now += 300 * 1000
    expect(await sms.checkCode("+8613800138001", sms.peekCode("+8613800138001")!)).toBe("invalid")
  })
})
