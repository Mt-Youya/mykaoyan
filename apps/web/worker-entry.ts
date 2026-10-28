import serverEntry from "@tanstack/react-start/server-entry"

/**
 * API 反代的公开地址。
 *
 * 前端页面始终从 `https://mykaoyan.cn/api/**` 同源调用，由本 Worker 转发到 ECS 上的
 * `api.mykaoyan.cn`，这样浏览器 cookie 仍是第一方，不需要 CORS。
 */
const API_ORIGIN = "https://api.mykaoyan.cn"

type WorkerFetch = (request: Request, env: unknown, context: unknown) => Promise<Response>

function isApiRequest(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/")
}

async function proxyApi(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const target = new URL(url.pathname + url.search, API_ORIGIN)
  const headers = new Headers(request.headers)
  headers.delete("host")
  headers.set("x-forwarded-host", url.host)
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""))
  const clientIp = request.headers.get("cf-connecting-ip")
  if (clientIp) headers.set("x-forwarded-for", clientIp)

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body
    init.duplex = "half"
  }

  // 直接返回上游 Response，保留多个 Set-Cookie、状态码与流式 body。
  return fetch(target, init)
}

export default {
  async fetch(request: Request, env: unknown, context: unknown): Promise<Response> {
    const url = new URL(request.url)
    if (isApiRequest(url.pathname)) return proxyApi(request)

    const entry = serverEntry as unknown as { fetch: WorkerFetch }
    return entry.fetch(request, env, context)
  },
}
