import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { unstable_readConfig } from "wrangler"
import { z } from "zod"

import { key, secret, token } from "./fixtures/token"
import worker from "./index"

const config = unstable_readConfig({ config: "wrangler.jsonc" })
const origins = z.array(z.string()).min(1).parse(config.vars.ALLOWED_ORIGINS)
const uploaded = new Date("2026-10-25T00:00:00Z")

function object(data: string): R2ObjectBody {
  const response = new Response(data)
  return {
    key,
    version: "fictional-version",
    size: 10,
    etag: "fixture-etag",
    httpEtag: '"fixture-etag"',
    uploaded,
    checksums: { toJSON: () => ({}) },
    storageClass: "Standard",
    httpMetadata: { contentType: "video/mp4" },
    customMetadata: {},
    writeHttpMetadata(headers) {
      headers.set("Content-Type", "video/mp4")
    },
    body: response.body!,
    get bodyUsed() {
      return response.bodyUsed
    },
    arrayBuffer: () => response.arrayBuffer(),
    bytes: () => response.bytes(),
    text: () => response.text(),
    json: <T>() => response.json<T>(),
    blob: () => response.blob(),
  }
}

function fixture() {
  const bucket = {
    head: vi.fn<R2Bucket["head"]>(async () => object("0123456789")),
    get: vi.fn<R2Bucket["get"]>(async (_key, options) => {
      const range = { offset: 0, length: 10, ...options?.range }
      const result = object("0123456789".substring(range.offset, range.offset + range.length))
      // R2 的 range 键常驻；完整响应的各键实际为 undefined。
      Object.defineProperty(result, "range", {
        value: options?.range
          ? { ...range, suffix: undefined }
          : { offset: undefined, length: undefined, suffix: undefined },
      })
      return result
    }),
  }
  return { bucket, environment: { ALLOWED_ORIGINS: origins, MEDIA_SIGNING_KEY: secret, BUCKET: bucket } }
}

function request(signed = token(), headers: Record<string, string> = {}, method = "GET") {
  const url = new URL(`https://media.invalid/${key}`)
  url.searchParams.set("token", signed)
  return new Request(url, { method, headers })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-26T00:00:00Z"))
})
afterEach(() => {
  vi.useRealTimers()
})

describe("媒体请求边界", () => {
  it("缺失或空串密钥、无效来源配置都返回 503 且不读 R2", async () => {
    const { bucket, environment } = fixture()
    await Promise.all(
      [undefined, "", "short"].map(async (value) => {
        const invalid = { ...environment }
        Reflect.set(invalid, "MEDIA_SIGNING_KEY", value)
        expect((await worker.fetch(request(), invalid)).status).toBe(503)
      }),
    )
    expect((await worker.fetch(request(), { ...environment, ALLOWED_ORIGINS: ["invalid"] })).status).toBe(503)
    expect(bucket.head).not.toHaveBeenCalled()
  })

  it.each(["", "malformed", "e30.invalid"])("无效令牌 %s 返回 401，且不读取 R2", async (signed) => {
    const { bucket, environment } = fixture()
    const response = await worker.fetch(request(signed), environment)
    expect(response.status).toBe(401)
    expect(bucket.head).not.toHaveBeenCalled()
    expect(bucket.get).not.toHaveBeenCalled()
    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })

  it.each([{ exp: 1 }, { key: "other.mp4" }, { exp: 9999999999 }, { iat: 9999999999 }])(
    "拒绝过期、越权或时间范围非法的令牌 %j",
    async (overrides) => {
      const { bucket, environment } = fixture()
      expect((await worker.fetch(request(token(overrides)), environment)).status).toBe(401)
      expect(bucket.head).not.toHaveBeenCalled()
      expect(bucket.get).not.toHaveBeenCalled()
    },
  )

  it("签名被修改后不能读 R2", async () => {
    const { bucket, environment } = fixture()
    const [payload, signature] = token().split(".") as [string, string]
    const tampered = `${payload}.${signature[0] === "A" ? "B" : "A"}${signature.substring(1)}`
    expect((await worker.fetch(request(tampered), environment)).status).toBe(401)
    expect(bucket.head).not.toHaveBeenCalled()
  })

  it("完整响应忽略各键均为 undefined 的 range，不误报 206", async () => {
    const { environment } = fixture()
    const response = await worker.fetch(request(), environment)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-range")).toBeNull()
    expect(response.headers.get("content-length")).toBe("10")
    expect(await response.text()).toBe("0123456789")
  })

  it("对象元数据不能覆盖私有缓存策略，读取失败也不会沿用视频长度", async () => {
    const { bucket, environment } = fixture()
    const metadata = object("0123456789")
    metadata.writeHttpMetadata = (headers) => {
      headers.set("Cache-Control", "public, max-age=3600")
    }
    bucket.head.mockResolvedValue(metadata)
    const full = await worker.fetch(request(), environment)
    expect(full.headers.get("cache-control")).toBe("private, no-store")
    bucket.get.mockResolvedValueOnce(null)
    const missing = await worker.fetch(request(), environment)
    expect(missing.status).toBe(404)
    expect(missing.headers.get("content-length")).toBeNull()
    expect(missing.headers.get("cache-control")).toBe("private, no-store")
  })

  it.each([
    ["bytes=0-3", "0123", "bytes 0-3/10"],
    ["bytes=0-0", "0", "bytes 0-0/10"],
    ["bytes=5-", "56789", "bytes 5-9/10"],
    ["bytes=-3", "789", "bytes 7-9/10"],
    ["bytes=8-99", "89", "bytes 8-9/10"],
  ])("%s 返回正确的部分内容", async (range, body, contentRange) => {
    const { environment } = fixture()
    const response = await worker.fetch(request(token(), { Range: range }), environment)
    expect(response.status).toBe(206)
    expect(response.headers.get("content-range")).toBe(contentRange)
    expect(response.headers.get("content-length")).toBe(String(body.length))
    expect(await response.text()).toBe(body)
  })

  it.each(["bytes=10-", "bytes=5-2", "bytes=-0"])("不可满足的 %s 返回 416", async (range) => {
    const { bucket, environment } = fixture()
    const response = await worker.fetch(request(token(), { Range: range }), environment)
    expect(response.status).toBe(416)
    expect(response.headers.get("content-range")).toBe("bytes */10")
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it.each([
    [{ "If-None-Match": 'W/"fixture-etag"' }, 304],
    [{ "If-Modified-Since": uploaded.toUTCString() }, 304],
    [{ "If-Match": '"other"' }, 412],
    [{ "If-Match": 'W/"fixture-etag"' }, 412],
    [{ "If-Unmodified-Since": "Fri, 23 Oct 2026 00:00:00 GMT" }, 412],
  ])("条件请求 %j 返回 %i 且不读取正文", async (headers, status) => {
    const { bucket, environment } = fixture()
    const response = await worker.fetch(request(token(), headers), environment)
    expect(response.status).toBe(status)
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it("If-Range 不匹配时返回完整内容，HEAD 不读取正文", async () => {
    const { bucket, environment } = fixture()
    expect(
      (await worker.fetch(request(token(), { Range: "bytes=0-3", "If-Range": '"other"' }), environment)).status,
    ).toBe(200)
    bucket.get.mockClear()
    const response = await worker.fetch(request(token(), {}, "HEAD"), environment)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-length")).toBe("10")
    expect(await response.text()).toBe("")
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it.each([
    ["Sat, 24 Oct 2026 00:00:00 GMT", 200],
    ["Sun, 25 Oct 2026 00:00:00 GMT", 206],
    ["Mon, 26 Oct 2026 00:00:00 GMT", 200],
  ])("If-Range 日期 %s 仅在精确匹配时使用区间，返回 %i", async (date, status) => {
    const { environment } = fixture()
    const response = await worker.fetch(request(token(), { Range: "bytes=0-3", "If-Range": date }), environment)
    expect(response.status).toBe(status)
  })

  it("CORS 只接受配置中的精确 origin", async () => {
    const { bucket, environment } = fixture()
    await Promise.all(
      origins.map(async (origin) => {
        const response = await worker.fetch(request(token(), { Origin: origin }), environment)
        expect(response.headers.get("access-control-allow-origin")).toBe(origin)
      }),
    )
    bucket.head.mockClear()
    const response = await worker.fetch(request(token(), { Origin: `${origins[0]}.attacker.invalid` }), environment)
    expect(response.status).toBe(403)
    expect(bucket.head).not.toHaveBeenCalled()
  })
})
