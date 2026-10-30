import { describe, expect, it } from "vitest"

import { appendSetCookies, toFetchRequest, writeFetchResponse, writeProblem } from "./http"
import type { NodeResponseLike } from "./http"

function captureResponse() {
  const state = { statusCode: 0, headers: {} as Record<string, string | number | readonly string[]>, body: "" }
  const response: NodeResponseLike = {
    get statusCode() {
      return state.statusCode
    },
    set statusCode(value: number) {
      state.statusCode = value
    },
    setHeader(name, value) {
      state.headers[name.toLowerCase()] = value
    },
    end(body) {
      state.body = typeof body === "string" ? body : new TextDecoder().decode(body)
    },
  }
  return { state, response }
}

describe("把 Better Auth 的 Response 原样转回浏览器", () => {
  it("多条 Set-Cookie 全部保留（会话刷新必须逐条透传）", async () => {
    const upstream = new Response(JSON.stringify({ session: null }), { status: 200 })
    upstream.headers.set("content-type", "application/json")
    upstream.headers.append("set-cookie", "better-auth.session_token=new.1; Path=/; HttpOnly; Max-Age=2592000")
    upstream.headers.append("set-cookie", "better-auth.session_data=cached; Path=/; HttpOnly")
    const { state, response } = captureResponse()
    await writeFetchResponse(upstream, response)
    expect(state.statusCode).toBe(200)
    expect(state.headers["content-type"]).toBe("application/json")
    expect(state.headers["set-cookie"]).toEqual([
      "better-auth.session_token=new.1; Path=/; HttpOnly; Max-Age=2592000",
      "better-auth.session_data=cached; Path=/; HttpOnly",
    ])
    expect(state.body).toBe(JSON.stringify({ session: null }))
  })

  it("没有 Set-Cookie 时不写这个响应头", async () => {
    const { state, response } = captureResponse()
    await writeFetchResponse(new Response(null, { status: 204 }), response)
    expect(state.headers["set-cookie"]).toBeUndefined()
    expect(state.statusCode).toBe(204)
  })

  it("appendSetCookies 空数组不产生响应头", () => {
    const { state, response } = captureResponse()
    appendSetCookies(response, [])
    expect(state.headers["set-cookie"]).toBeUndefined()
    appendSetCookies(response, ["a=b; Path=/"])
    expect(state.headers["set-cookie"]).toEqual(["a=b; Path=/"])
  })
})

describe("把 Nest 请求重建为 Web Request", () => {
  it("GET 不带 body，路径取 originalUrl", () => {
    const request = toFetchRequest(
      { method: "GET", url: "/auth", originalUrl: "/api/auth/get-session?x=1", headers: { cookie: "a=b" } },
      "https://mykaoyan.example",
    )
    expect(request.method).toBe("GET")
    expect(request.url).toBe("https://mykaoyan.example/api/auth/get-session?x=1")
    expect(request.headers.get("cookie")).toBe("a=b")
  })

  it("POST 用已解析的 body 重建 JSON，不依赖原始请求流", async () => {
    const request = toFetchRequest(
      {
        method: "POST",
        originalUrl: "/api/auth/verify",
        headers: { "content-type": "application/json" },
        body: { a: 1 },
      },
      "https://mykaoyan.example",
    )
    expect(request.method).toBe("POST")
    expect(await request.json()).toEqual({ a: 1 })
  })
})

describe("problem+json", () => {
  it("保留错误码与重试秒数", () => {
    const { state, response } = captureResponse()
    writeProblem(response, 429, "请 42 秒后再试", "OTP_SEND_TOO_SOON", 42)
    expect(state.statusCode).toBe(429)
    expect(state.headers["content-type"]).toBe("application/problem+json")
    expect(state.headers["retry-after"]).toBe("42")
    expect(JSON.parse(state.body)).toEqual({
      type: "about:blank",
      title: "请 42 秒后再试",
      status: 429,
      code: "OTP_SEND_TOO_SOON",
    })
  })
})
