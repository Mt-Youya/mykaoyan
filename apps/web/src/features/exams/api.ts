/**
 * 真题试卷的浏览器端数据获取。
 *
 * 题面接口公开；答案接口需要登录与有效会员，未登录返回 401、非会员返回 403。
 */

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
  questions: PaperAnswerQuestion[]
}

export type PapersState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "unauthorized" }
  | { status: "forbidden" }
  | { status: "not-found" }
  | { status: "error" }

/** 浏览器端请求试卷题面；与课程浏览共用同一套状态约定。 */
export async function fetchPapers<T>(path: string, signal: AbortSignal): Promise<PapersState<T>> {
  try {
    const response = await fetch(path, { signal, headers: { accept: "application/json" } })
    if (response.status === 401) return { status: "unauthorized" }
    if (response.status === 403) return { status: "forbidden" }
    if (response.status === 404) return { status: "not-found" }
    if (!response.ok) return { status: "error" }
    return { status: "ok", data: (await response.json()) as T }
  } catch {
    return { status: "error" }
  }
}
