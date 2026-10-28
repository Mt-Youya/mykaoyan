import { describe, expect, it } from "vitest"
import { apiOrigin, collectSetCookies, problemMessage } from "./-auth"

describe("SSR 会话 cookie 转发", () => {
  it("多条 Set-Cookie 一条不少，顺序不变", () => {
    const headers = new Headers()
    headers.append("set-cookie", "better-auth.session_token=new; Path=/; HttpOnly")
    headers.append("set-cookie", "better-auth.session_data=cached; Path=/")
    expect(collectSetCookies(headers)).toEqual([
      "better-auth.session_token=new; Path=/; HttpOnly",
      "better-auth.session_data=cached; Path=/",
    ])
  })

  it("没有 Set-Cookie 时返回空数组，不凭空造 cookie", () => {
    expect(collectSetCookies(new Headers())).toEqual([])
  })
})

describe("problem+json 提示", () => {
  it("优先用服务端 title（含「还要等多久」「验证码错误/过期」）", () => {
    expect(problemMessage({ title: "验证码已过期，请重新获取", code: "OTP_EXPIRED" })).toBe("验证码已过期，请重新获取")
    expect(problemMessage({ title: "验证码已发送，请 58 秒后再试", code: "OTP_SEND_TOO_SOON" })).toContain("58 秒")
  })

  it("响应不是 problem+json 时给兜底文案", () => {
    expect(problemMessage(null)).toBe("操作失败，请稍后重试")
    expect(problemMessage({ code: "X" })).toBe("操作失败，请稍后重试")
  })
})

describe("API 地址", () => {
  it("优先运行时配置，去掉末尾斜杠", () => {
    process.env.API_ORIGIN = "https://api.example/"
    expect(apiOrigin(new Request("https://web.example/login"))).toBe("https://api.example")
  })

  it("没有配置时按请求 origin 推", () => {
    delete process.env.API_ORIGIN
    expect(apiOrigin(new Request("https://web.example/login"))).toBe("https://web.example")
  })
})
