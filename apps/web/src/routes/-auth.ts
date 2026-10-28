/**
 * 登录页的服务端辅助：拿手机号登录策略、读会话，并把后端会话刷新的 `Set-Cookie` 带回浏览器。
 *
 * 单独成模块（`-` 前缀，TanStack Router 不会当成路由文件），纯函数便于单测。
 */
export type PhonePolicy = {
  codeLength: number
  codeTtlSeconds: number
  cooldownSeconds: number
  privacyPolicyVersion: string
}

export type SessionUser = { id: string }

export type LoginState = {
  policy: PhonePolicy
  session: SessionUser | null
}

/** 后端地址：服务端渲染时优先用运行时配置，没有就按本次请求的 origin 推。 */
export function apiOrigin(request: Request): string {
  const configured = process.env.API_ORIGIN?.trim()
  if (configured && configured.length > 0) return configured.replace(/\/+$/, "")
  return new URL(request.url).origin
}

/** 会话刷新会下发多条 Set-Cookie（session_token / session_data），必须逐条保留。 */
export function collectSetCookies(headers: Headers): string[] {
  return headers.getSetCookie()
}

/** 把后端 problem+json 转成给考生看的提示；服务端的 title 已经是中文准确提示。 */
export function problemMessage(problem: { title?: unknown; code?: unknown } | null | undefined): string {
  if (problem && typeof problem.title === "string" && problem.title.length > 0) return problem.title
  return "操作失败，请稍后重试"
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

/** SSR：读当前会话与登录策略；返回需要回写给浏览器的 `Set-Cookie`。 */
export async function loadLoginState(request: Request): Promise<{ state: LoginState; setCookies: string[] }> {
  const origin = apiOrigin(request)
  const cookie = request.headers.get("cookie")
  const [sessionResponse, policyResponse] = await Promise.all([
    fetch(`${origin}/api/auth/get-session`, { headers: cookie ? { cookie } : {} }),
    fetch(`${origin}/api/phone/policy`),
  ])
  if (!policyResponse.ok) throw new Error("登录策略暂不可用，请稍后重试")
  const policy = (await readJson<PhonePolicy>(policyResponse)) ?? {
    codeLength: 6,
    codeTtlSeconds: 300,
    cooldownSeconds: 60,
    privacyPolicyVersion: "",
  }
  const session = sessionResponse.ok ? await readJson<{ user?: SessionUser }>(sessionResponse) : null
  return {
    state: { policy, session: session?.user ?? null },
    setCookies: collectSetCookies(sessionResponse.headers),
  }
}

/** 浏览器端调用 API；错误统一转成 { code, message }。 */
export async function postJson(
  path: string,
  body: unknown
): Promise<{ ok: true } | { ok: false; code: string; message: string; retryAfterSeconds?: number }> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  })
  if (response.ok) return { ok: true }
  const problem = await readJson<{ title?: unknown; code?: unknown }>(response)
  const retryAfter = Number(response.headers.get("retry-after") ?? "")
  return {
    ok: false,
    code: typeof problem?.code === "string" ? problem.code : "UNKNOWN",
    message: problemMessage(problem),
    ...(Number.isFinite(retryAfter) ? { retryAfterSeconds: retryAfter } : {}),
  }
}
