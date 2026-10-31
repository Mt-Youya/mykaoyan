/**
 * 试卷的浏览器端数据获取：真题与用户试卷共用题面/答案接口。
 *
 * 题面公开；答案接口需要登录与有效会员（或试卷上传者本人、管理员）。
 * 用户试卷的提交、我的试卷与管理审核另走登录接口。
 */

export type PaperOrigin = "admin" | "user"
export type PaperReviewStatus = "pending" | "approved" | "rejected"

export type PaperOption = { label: string; markdown: string }

export type PaperQuestion = {
  number: number
  type: string
  score: number | null
  topics: string[] | null
  stemMarkdown: string
  options: PaperOption[] | null
}

export type PaperSummary = {
  slug: string
  title: string
  year: number
  subjectCode: string
  sourceNote: string | null
  origin: PaperOrigin
  questionCount: number
}

export type PaperDetail = PaperSummary & { questions: PaperQuestion[] }

export type PaperAnswerQuestion = PaperQuestion & {
  answerMarkdown: string
  analysisMarkdown: string | null
}

export type PaperAnswers = {
  slug: string
  title: string
  year: number
  origin: PaperOrigin
  questions: PaperAnswerQuestion[]
}

/** 我的试卷列表项：审核状态与驳回原因只对本人与管理员出现。 */
export type OwnPaper = {
  slug: string
  title: string
  year: number
  subjectCode: string
  sourceNote: string | null
  origin: "user"
  questionCount: number
  reviewStatus: PaperReviewStatus
  listed: boolean
  reviewReason: string | null
  createdAt: string
  reviewedAt: string | null
}

export type OwnPaperList = { enabled: boolean; items: OwnPaper[]; hasMore: boolean }

export type OwnPaperDetail = OwnPaper & {
  rightsConfirmedAt: string | null
  questions: PaperAnswerQuestion[]
}

export type SubmittedPaper = {
  slug: string
  origin: "user"
  reviewStatus: "pending"
  listed: false
  questionCount: number
}

export type PapersState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "unauthorized" }
  | { status: "forbidden" }
  | { status: "not-found" }
  | { status: "error" }

/** 试卷相关请求的状态约定：401/403/404 分别交给页面显示对应提示。 */
export async function paperRequest<T>(path: string, init: RequestInit = {}): Promise<PapersState<T>> {
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
    if (response.status === 404) return { status: "not-found" }
    if (!response.ok) return { status: "error" }
    return { status: "ok", data: (await response.json()) as T }
  } catch {
    return { status: "error" }
  }
}

/** 浏览器端请求试卷题面；与课程浏览共用同一套状态约定。 */
export async function fetchPapers<T>(path: string, signal: AbortSignal): Promise<PapersState<T>> {
  return paperRequest<T>(path, { signal })
}

function problemMessage(problem: unknown, fallback: string) {
  const title = (problem as { title?: unknown } | null)?.title
  return typeof title === "string" && title.trim() ? title : fallback
}

export type SubmitResult =
  | { status: "ok"; data: SubmittedPaper }
  | { status: "unauthorized" }
  | { status: "invalid"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string }

/** 提交用户试卷；客户端已用 core 的 `submitPaperSchema` 校验过，这里负责网络与状态映射。 */
export async function submitUserPaper(input: unknown): Promise<SubmitResult> {
  let response: Response
  try {
    response = await fetch("/api/papers/submissions", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(input),
    })
  } catch {
    return { status: "error", message: "网络异常，提交结果可能未确认；请到「我的试卷」核对后再重试" }
  }
  const problem = await response
    .clone()
    .json()
    .catch(() => null)
  if (response.status === 401) return { status: "unauthorized" }
  if (response.status === 400)
    return { status: "invalid", message: problemMessage(problem, "试卷内容未通过校验，请检查题号、选项与整卷大小") }
  if (response.status === 403) return { status: "forbidden", message: problemMessage(problem, "用户试卷提交尚未开放") }
  if (!response.ok) return { status: "error", message: problemMessage(problem, "提交失败，请稍后重试") }
  return { status: "ok", data: (await response.json()) as SubmittedPaper }
}

/** 我的试卷列表与全文预览：未登录返回 401 状态。 */
export function fetchMyPapers(page = 0) {
  return paperRequest<OwnPaperList>(`/api/papers/mine?page=${page}`)
}

export function fetchMyPaper(slug: string) {
  return paperRequest<OwnPaperDetail>(`/api/papers/mine/${encodeURIComponent(slug)}`)
}
