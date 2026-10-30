import { describe, expect, it } from "vitest"

import { StartupConfigError } from "../../common"
import { readAuthEnvironment } from "./environment"

const secret = "x".repeat(32)
const base = { BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: "https://mykaoyan.example", SMS_PROVIDER: "memory" }
const aliyun = {
  ALIYUN_ACCESS_KEY_ID: "AKID_TEST_ONLY",
  ALIYUN_ACCESS_KEY_SECRET: "SECRET_TEST_ONLY",
  ALIYUN_SMS_SIGN_NAME: "虚构签名",
  ALIYUN_SMS_TEMPLATE_CODE: "100001",
}

describe("认证启动配置", () => {
  it("生产环境必须显式给足密钥与阿里云凭据，缺失即启动失败", () => {
    expect(() => readAuthEnvironment({ ...base, BETTER_AUTH_SECRET: undefined }, "production")).toThrow(
      "BETTER_AUTH_SECRET",
    )
    expect(() => readAuthEnvironment({ ...base, BETTER_AUTH_SECRET: "" }, "production")).toThrow("BETTER_AUTH_SECRET")
    expect(() => readAuthEnvironment({ ...base, BETTER_AUTH_SECRET: "short" }, "production")).toThrow(
      "BETTER_AUTH_SECRET",
    )
    expect(() => readAuthEnvironment({ ...base, SMS_PROVIDER: undefined }, "production")).toThrow("SMS_PROVIDER")
    expect(() => readAuthEnvironment({ ...base, SMS_PROVIDER: "memory" }, "production")).toThrow("SMS_PROVIDER")
    expect(() => readAuthEnvironment({ ...base, SMS_PROVIDER: "aliyun" }, "production")).toThrow("ALIYUN_ACCESS_KEY_ID")
    expect(() => readAuthEnvironment({ ...base, SMS_PROVIDER: "aliyun", ...aliyun }, "production")).not.toThrow()
  })

  it("配置错误使用可识别的 StartupConfigError，启动入口据此打印键名", () => {
    expect(() => readAuthEnvironment({ ...base, SMS_PROVIDER: undefined }, "development")).toThrow(StartupConfigError)
  })

  it("生产环境接受完整阿里云配置，并给出模板/端点默认值", () => {
    const env = readAuthEnvironment({ ...base, SMS_PROVIDER: "aliyun", ...aliyun }, "production")
    expect(env.sms.provider).toBe("aliyun")
    if (env.sms.provider !== "aliyun") throw new Error("unreachable")
    expect(env.sms.endpoint).toBe("https://dypnsapi.aliyuncs.com")
    expect(env.sms.templateParam).toBe('{"code":"##code##","min":"5"}')
    expect(env.trustedOrigins).toEqual(["https://mykaoyan.example"])
  })

  it("开发环境必须显式选择实现；选内存实现时不需要阿里云凭据", () => {
    expect(() => readAuthEnvironment({ ...base, SMS_PROVIDER: undefined }, "development")).toThrow("SMS_PROVIDER")
    expect(readAuthEnvironment(base, "development").sms.provider).toBe("memory")
  })

  it("测试环境强制内存实现并忽略外部短信选择，绝不真实发送", () => {
    const env = readAuthEnvironment({ ...base, SMS_PROVIDER: "aliyun" }, "test")
    expect(env.sms.provider).toBe("memory")
    const defaults = readAuthEnvironment({}, "test")
    expect(defaults.sms.provider).toBe("memory")
    expect(defaults.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32)
  })

  it("空串不算「未设置」，照样失败", () => {
    expect(() => readAuthEnvironment({ ...base, BETTER_AUTH_URL: "" }, "development")).toThrow("BETTER_AUTH_URL")
    expect(() => readAuthEnvironment({ ...base, BETTER_AUTH_URL: "" }, "test")).toThrow("BETTER_AUTH_URL")
  })

  it("允许用逗号分隔多个可信 origin", () => {
    const env = readAuthEnvironment(
      { ...base, AUTH_TRUSTED_ORIGINS: "https://a.example, https://b.example" },
      "development",
    )
    expect(env.trustedOrigins).toEqual(["https://a.example", "https://b.example"])
  })

  it("可选 AUTH_COOKIE_DOMAIN 用于页面与 API 跨子域共享 cookie", () => {
    expect(readAuthEnvironment(base, "development").cookieDomain).toBeUndefined()
    expect(readAuthEnvironment({ ...base, AUTH_COOKIE_DOMAIN: "mykaoyan.cn" }, "development").cookieDomain).toBe(
      "mykaoyan.cn",
    )
    expect(readAuthEnvironment({ ...base, AUTH_COOKIE_DOMAIN: ".mykaoyan.cn" }, "development").cookieDomain).toBe(
      ".mykaoyan.cn",
    )
  })

  it("AUTH_COOKIE_DOMAIN 只接受域名，拒绝协议与路径", () => {
    expect(() => readAuthEnvironment({ ...base, AUTH_COOKIE_DOMAIN: "https://mykaoyan.cn" }, "development")).toThrow(
      "AUTH_COOKIE_DOMAIN",
    )
    expect(() => readAuthEnvironment({ ...base, AUTH_COOKIE_DOMAIN: "mykaoyan.cn/path" }, "development")).toThrow(
      "AUTH_COOKIE_DOMAIN",
    )
  })
})
