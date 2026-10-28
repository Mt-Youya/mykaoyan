import { describe, expect, it } from "vitest"
import { OTP_CODE_LENGTH, OTP_SEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS } from "../policy"
import { AliyunSmsVerifier, canonicalQuery, percentEncode, signRpcRequest } from "./sms-aliyun"
import type { AliyunAuthEnvironment } from "../environment"
import { SmsProviderError } from "./sms"

const config: AliyunAuthEnvironment = {
  provider: "aliyun",
  accessKeyId: "AKID_TEST_ONLY",
  accessKeySecret: "SECRET_TEST_ONLY",
  signName: "虚构签名",
  templateCode: "100001",
  templateParam: '{"code":"##code##","min":"5"}',
  endpoint: "https://dypnsapi.example.invalid",
}

const fixedNow = new Date("2026-10-27T04:00:00.000Z")
const fixedNonce = "00000000-0000-4000-8000-000000000000"

function captureFetch(payload: unknown) {
  const urls: string[] = []
  return {
    urls,
    fetchImpl: async (input: string) => {
      urls.push(input)
      return { ok: true, status: 200, json: async () => payload }
    },
  }
}

describe("阿里云 RPC 签名", () => {
  it("按 RFC 3986 编码并排序参数", () => {
    expect(percentEncode("a b*c~d!'()")).toBe("a%20b%2Ac~d%21%27%28%29")
    expect(canonicalQuery({ b: "2", a: "1" })).toBe("a=1&b=2")
  })

  it("签名只取决于参数、方法与密钥，且可复算", () => {
    const parameters = { Action: "SendSmsVerifyCode", Version: "2017-05-25", SignatureNonce: fixedNonce }
    const first = signRpcRequest(parameters, "GET", config.accessKeySecret)
    expect(first).toBe(signRpcRequest(parameters, "GET", config.accessKeySecret))
    expect(first).not.toBe(signRpcRequest(parameters, "GET", `${config.accessKeySecret}x`))
    expect(first).not.toBe(signRpcRequest(parameters, "POST", config.accessKeySecret))
    expect(first).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })
})

describe("阿里云发送与校验", () => {
  it("发送请求带上模板位数/有效期/纯数字/覆盖策略，且不请求返回验证码", async () => {
    const { urls, fetchImpl } = captureFetch({ Code: "OK", RequestId: "req-1" })
    const verifier = new AliyunSmsVerifier(
      config,
      fetchImpl,
      () => fixedNow,
      () => fixedNonce
    )
    await expect(verifier.sendCode("+8613800138000")).resolves.toEqual({ requestId: "req-1" })

    const url = new URL(urls[0]!)
    expect(url.hostname).toBe("dypnsapi.example.invalid")
    expect(url.searchParams.get("Action")).toBe("SendSmsVerifyCode")
    expect(url.searchParams.get("Version")).toBe("2017-05-25")
    expect(url.searchParams.get("PhoneNumber")).toBe("13800138000")
    expect(url.searchParams.get("CodeLength")).toBe(String(OTP_CODE_LENGTH))
    expect(url.searchParams.get("ValidTime")).toBe(String(OTP_TTL_SECONDS))
    expect(url.searchParams.get("Interval")).toBe(String(OTP_SEND_COOLDOWN_SECONDS))
    expect(url.searchParams.get("CodeType")).toBe("1")
    expect(url.searchParams.get("DuplicatePolicy")).toBe("1")
    expect(url.searchParams.get("ReturnVerifyCode")).toBe("false")
    expect(url.searchParams.get("Timestamp")).toBe("2026-10-27T04:00:00Z")
    expect(url.searchParams.get("Signature")).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(url.searchParams.get("SignatureNonce")).toBe(fixedNonce)
  })

  it("校验只把 PASS 当成功，UNKNOWN 一律失败", async () => {
    const passed = captureFetch({ Code: "OK", Model: { VerifyResult: "PASS" } })
    const failed = captureFetch({ Code: "OK", Model: { VerifyResult: "UNKNOWN" } })
    expect(
      await new AliyunSmsVerifier(
        config,
        passed.fetchImpl,
        () => fixedNow,
        () => fixedNonce
      ).checkCode("+8613800138000", "123456")
    ).toBe("valid")
    expect(
      await new AliyunSmsVerifier(
        config,
        failed.fetchImpl,
        () => fixedNow,
        () => fixedNonce
      ).checkCode("+8613800138000", "000000")
    ).toBe("invalid")
    expect(new URL(failed.urls[0]!).searchParams.get("VerifyCode")).toBe("000000")
  })

  it("保留上游错误码，错误信息不泄露手机号与请求签名", async () => {
    const { fetchImpl } = captureFetch({ Code: "BUSINESS_LIMIT_CONTROL", Message: "day limit" })
    const verifier = new AliyunSmsVerifier(
      config,
      fetchImpl,
      () => fixedNow,
      () => fixedNonce
    )
    const error = await verifier.sendCode("+8613800138000").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(SmsProviderError)
    expect((error as SmsProviderError).code).toBe("BUSINESS_LIMIT_CONTROL")
    expect((error as SmsProviderError).message).not.toContain("13800138000")
  })
})
