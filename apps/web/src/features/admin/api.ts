/** 管理视图的数据获取：内容上下架、用户试卷审核。 */

export type AdminLesson = {
  slug: string
  title: string
  listed: boolean
  chapterTitle: string
  courseSlug: string
  courseTitle: string
}

export type AdminHandout = { slug: string; title: string; listed: boolean; subjectCode: string }

export type PaperOrigin = "admin" | "user"
export type PaperReviewStatus = "pending" | "approved" | "rejected"

export type AdminPaper = {
  slug: string
  title: string
  listed: boolean
  subjectCode: string
  year: number
  origin: PaperOrigin
  reviewStatus: PaperReviewStatus
}

export type AdminContent = { lessons: AdminLesson[]; handouts: AdminHandout[]; papers: AdminPaper[] }

export type AdminResult<T> =
  | { status: "ok"; data: T }
  | { status: "unauthorized" }
  | { status: "forbidden" }
  | { status: "error" }

function problemMessage(problem: unknown, fallback: string) {
  const title = (problem as { title?: unknown } | null)?.title
  return typeof title === "string" && title.trim() ? title : fallback
}

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<AdminResult<T>> {
  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: {
        accept: "application/json",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...init.headers,
      },
    })
    if (response.status === 401) return { status: "unauthorized" }
    if (response.status === 403) return { status: "forbidden" }
    if (!response.ok) return { status: "error" }
    return { status: "ok", data: (await response.json()) as T }
  } catch {
    return { status: "error" }
  }
}

export async function fetchAdminContent(): Promise<AdminResult<AdminContent>> {
  return adminRequest<AdminContent>("/api/admin/content")
}

export async function setListing(
  target: "lesson" | "handout" | "paper",
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
  const problem = await response.json().catch(() => null)
  return { ok: false, message: problemMessage(problem, "操作失败，请稍后重试") }
}

/** 用户试卷审核队列项：来源账号与驳回原因只出现在管理员视图。 */
export type AdminPaperQueueItem = {
  slug: string
  title: string
  year: number
  subjectCode: string
  origin: "user"
  reviewStatus: PaperReviewStatus
  listed: boolean
  questionCount: number
  ownerAccountId: string | null
  author: string
  rightsConfirmedAt: string | null
  createdAt: string
  reviewedAt: string | null
  reviewReason: string | null
}

export type AdminPaperQueue = { enabled: boolean; items: AdminPaperQueueItem[]; hasMore: boolean }

export type AdminPaperAnswerQuestion = {
  number: number
  type: string
  score: number | null
  topics: string[] | null
  stemMarkdown: string
  options: { label: string; markdown: string }[] | null
  answerMarkdown: string
  analysisMarkdown: string | null
}

export type AdminPaperDetail = AdminPaperQueueItem & { questions: AdminPaperAnswerQuestion[] }

export type ReviewBody = { decision: "approve" } | { decision: "reject"; reason: string }
export type ReviewPayloadResult = { ok: true; body: ReviewBody } | { ok: false; message: string }

/** 审核请求体：通过不需要原因，驳回必须填写 1–500 字原因（与 API/契约一致）。 */
export function reviewPayload(decision: "approve" | "reject", reason: string): ReviewPayloadResult {
  if (decision === "approve") return { ok: true, body: { decision: "approve" } }
  const trimmed = reason.trim()
  if (!trimmed) return { ok: false, message: "驳回必须填写原因（1–500 字）" }
  if (trimmed.length > 500) return { ok: false, message: "驳回原因最多 500 字" }
  return { ok: true, body: { decision: "reject", reason: trimmed } }
}

export async function fetchAdminPapers(status?: string): Promise<AdminResult<AdminPaperQueue>> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ""
  return adminRequest<AdminPaperQueue>(`/api/admin/papers${query}`)
}

export async function fetchAdminPaper(slug: string): Promise<AdminResult<AdminPaperDetail>> {
  return adminRequest<AdminPaperDetail>(`/api/admin/papers/${encodeURIComponent(slug)}`)
}

export type ReviewedPaper = {
  slug: string
  reviewStatus: PaperReviewStatus
  listed: boolean
  reviewedAt: string
  reviewReason: string | null
}

export async function reviewPaper(
  slug: string,
  body: ReviewBody,
): Promise<{ ok: true; data: ReviewedPaper } | { ok: false; message: string }> {
  const response = await fetch(`/api/admin/papers/${encodeURIComponent(slug)}/review`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (response.ok) return { ok: true, data: (await response.json()) as ReviewedPaper }
  const problem = await response.json().catch(() => null)
  return { ok: false, message: problemMessage(problem, "审核失败，请稍后重试") }
}
