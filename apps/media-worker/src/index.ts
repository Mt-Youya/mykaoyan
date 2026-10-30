import { z } from "zod"

import { verifyToken } from "./auth"
import { allowsRange, conditionalStatus, parseRange } from "./http"

const configSchema = z.object({
  MEDIA_SIGNING_KEY: z
    .string()
    .min(32)
    .refine((value) => value.trim().length >= 32),
  ALLOWED_ORIGINS: z
    .array(
      z
        .string()
        .refine(
          (value) =>
            URL.canParse(value) &&
            ["http:", "https:"].includes(new URL(value).protocol) &&
            new URL(value).origin === value,
        ),
    )
    .min(1),
})

type MediaEnvironment = Omit<Env, "BUCKET" | "ALLOWED_ORIGINS"> & {
  BUCKET: Pick<R2Bucket, "head" | "get">
  ALLOWED_ORIGINS: readonly string[]
}

export default {
  async fetch(request: Request, env: MediaEnvironment): Promise<Response> {
    const headers = new Headers({ "Cache-Control": "private, no-store", Vary: "Origin" })
    const problem = (status: number, title: string) => {
      const result = new Headers(headers)
      result.delete("Content-Length")
      result.set("Content-Type", "application/problem+json")
      return new Response(request.method === "HEAD" ? null : JSON.stringify({ type: "about:blank", status, title }), {
        status,
        headers: result,
      })
    }
    const config = configSchema.safeParse(env)
    if (!config.success) return problem(503, "媒体配置尚未就绪")
    const origin = request.headers.get("Origin")
    if (origin && !config.data.ALLOWED_ORIGINS.includes(origin)) return problem(403, "来源不被允许")
    if (origin) headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified")
    if (request.method === "OPTIONS") {
      if (!origin) return problem(403, "缺少来源")
      headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
      headers.set(
        "Access-Control-Allow-Headers",
        "Range, If-Range, If-Match, If-None-Match, If-Modified-Since, If-Unmodified-Since",
      )
      return new Response(null, { status: 204, headers })
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      headers.set("Allow", "GET, HEAD, OPTIONS")
      return problem(405, "请求方法不被允许")
    }
    const url = new URL(request.url)
    let key: string
    try {
      key = decodeURIComponent(url.pathname.substring(1))
    } catch {
      return problem(401, "播放令牌无效或已过期")
    }
    if (!(await verifyToken(url.searchParams.get("token"), config.data.MEDIA_SIGNING_KEY, key))) {
      return problem(401, "播放令牌无效或已过期")
    }
    try {
      const metadata = await env.BUCKET.head(key)
      if (!metadata) return problem(404, "媒体不存在")
      metadata.writeHttpMetadata(headers)
      headers.set("Cache-Control", "private, no-store")
      headers.set("ETag", metadata.httpEtag)
      headers.set("Last-Modified", metadata.uploaded.toUTCString())
      headers.set("Accept-Ranges", "bytes")
      const condition = conditionalStatus(request.headers, metadata)
      if (condition === 412) return problem(412, "媒体条件不满足")
      if (condition === 304) return new Response(null, { status: 304, headers })
      const range =
        request.method === "GET" && allowsRange(request.headers, metadata)
          ? parseRange(request.headers.get("Range"), metadata.size)
          : undefined
      if (range === "unsatisfiable") {
        headers.set("Content-Range", `bytes */${metadata.size}`)
        return problem(416, "请求区间不可满足")
      }
      headers.set("Content-Length", String(range?.length ?? metadata.size))
      if (request.method === "HEAD") return new Response(null, { headers })
      const object = await env.BUCKET.get(key, { onlyIf: { etagMatches: metadata.etag }, ...(range ? { range } : {}) })
      if (!object) return problem(404, "媒体不存在")
      if (!("body" in object)) return problem(503, "媒体已更新，请重试")
      if (range) {
        const actual = { offset: undefined, length: undefined, ...object.range }
        if (
          !Number.isSafeInteger(actual.offset) ||
          !Number.isSafeInteger(actual.length) ||
          actual.offset !== range.offset ||
          actual.length !== range.length
        ) {
          await object.body.cancel()
          headers.delete("Content-Length")
          return problem(503, "媒体区间读取失败")
        }
        headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`)
      }
      return new Response(object.body, { status: range ? 206 : 200, headers })
    } catch {
      headers.delete("Content-Length")
      return problem(503, "媒体暂不可用")
    }
  },
} satisfies ExportedHandler<Env>
