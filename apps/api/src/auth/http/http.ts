/** 把 Nest/Express 的请求响应收敛成最小结构，避免在测试里依赖 express 类型。 */
export type NodeRequestLike = {
  method?: string
  url?: string
  originalUrl?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

export type NodeResponseLike = {
  statusCode: number
  setHeader(name: string, value: string | number | readonly string[]): unknown
  end(body?: Uint8Array | string): unknown
}

export function toFetchHeaders(headers: NodeRequestLike["headers"]): Headers {
  const result = new Headers()
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue
    result.set(name, Array.isArray(value) ? value.join(", ") : value)
  }
  return result
}

/**
 * 用 Nest 已经解析好的 body 重建 Web Request 交给 Better Auth：
 * 不需要为了认证关闭全局 body parser，也不依赖原始请求流。
 */
export function toFetchRequest(request: NodeRequestLike, baseUrl: string): Request {
  const method = (request.method ?? "GET").toUpperCase()
  const url = new URL(request.originalUrl ?? request.url ?? "/", baseUrl)
  const headers = toFetchHeaders(request.headers)
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers })
  }
  if (request.body === undefined) return new Request(url, { method, headers })
  const body = typeof request.body === "string" ? request.body : JSON.stringify(request.body)
  return new Request(url, { method, headers, body })
}

/** 把 Better Auth 的 Response 原样写回 Express，`Set-Cookie` 逐条透传。 */
export async function writeFetchResponse(response: Response, target: NodeResponseLike): Promise<void> {
  target.statusCode = response.status
  const cookies = response.headers.getSetCookie()
  response.headers.forEach((value, name) => {
    if (name.toLowerCase() === "set-cookie") return
    target.setHeader(name, value)
  })
  if (cookies.length > 0) target.setHeader("set-cookie", cookies)
  target.end(new Uint8Array(await response.arrayBuffer()))
}

/** 会话刷新等场景下把 `Set-Cookie` 追加到响应（SSR 转发依赖它）。 */
export function appendSetCookies(response: NodeResponseLike, cookies: readonly string[]): void {
  if (cookies.length === 0) return
  response.setHeader("set-cookie", cookies)
}

export function writeProblem(
  response: NodeResponseLike,
  status: number,
  title: string,
  code: string,
  retryAfterSeconds?: number
): void {
  response.statusCode = status
  response.setHeader("content-type", "application/problem+json")
  response.setHeader("cache-control", "no-store")
  if (retryAfterSeconds !== undefined) response.setHeader("retry-after", String(retryAfterSeconds))
  response.end(JSON.stringify({ type: "about:blank", title, status, code }))
}

export function writeJson(response: NodeResponseLike, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader("content-type", "application/json; charset=utf-8")
  response.setHeader("cache-control", "no-store")
  response.end(JSON.stringify(body))
}
