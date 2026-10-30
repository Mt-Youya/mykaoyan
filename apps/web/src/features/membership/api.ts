export type MembershipStatus = { active: boolean; expiresAt: string | null }
export type CodeList = {
  items: { id: string; last4: string; createdAt: string; redeemedAt: string | null; redeemedBy: string | null }[]
  hasMore: boolean
}
export async function membershipRequest<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    throw new Error("网络连接失败，请稍后重试")
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { title?: string } | null
    throw new Error(
      response.status === 401
        ? "请先登录"
        : typeof problem?.title === "string"
          ? problem.title
          : "操作失败，请稍后重试",
    )
  }
  return (await response.json()) as T
}
export function formatMembershipDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
