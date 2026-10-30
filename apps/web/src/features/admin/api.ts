/** 管理视图的数据获取：全部讲与讲义（含未上架），以及上下架操作。 */

export type AdminLesson = {
  slug: string
  title: string
  listed: boolean
  chapterTitle: string
  courseSlug: string
  courseTitle: string
}

export type AdminHandout = { slug: string; title: string; listed: boolean; subjectCode: string }

export type AdminContent = { lessons: AdminLesson[]; handouts: AdminHandout[] }

export type AdminResult<T> =
  | { status: "ok"; data: T }
  | { status: "unauthorized" }
  | { status: "forbidden" }
  | { status: "error" }

export async function fetchAdminContent(): Promise<AdminResult<AdminContent>> {
  const response = await fetch("/api/admin/content", { credentials: "same-origin" })
  if (response.status === 401) return { status: "unauthorized" }
  if (response.status === 403) return { status: "forbidden" }
  if (!response.ok) return { status: "error" }
  return { status: "ok", data: (await response.json()) as AdminContent }
}

export async function setListing(
  target: "lesson" | "handout",
  slug: string,
  listed: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch(`/api/admin/${target}s/${encodeURIComponent(slug)}/listing`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ listed }),
  })
  if (response.ok) return { ok: true }
  const problem = (await response.json().catch(() => null)) as { title?: unknown } | null
  return {
    ok: false,
    message: typeof problem?.title === "string" ? problem.title : "操作失败，请稍后重试",
  }
}
