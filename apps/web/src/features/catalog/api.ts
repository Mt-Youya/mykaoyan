/**
 * 课程浏览的浏览器端数据获取。
 *
 * 数据全部来自 apps/api 的公开接口；这里只做请求与状态映射，不包含业务规则。
 * 使用相对路径 fetch，仅在浏览器端调用（SSR 时没有可用的相对 URL）。
 */

/** 课程卡片：访客按考试科目浏览时看到的最少信息。 */
export type CourseSummary = { slug: string; title: string; summary: string }

/** 讲列表项：章内按顺序排列。 */
export type LessonSummary = { slug: string; title: string; videoKey: string; subtitleKey: string | null }

/** 课程详情：课程本身加按顺序排列的章与讲。 */
export type CourseDetail = CourseSummary & {
  chapters: { title: string; lessons: LessonSummary[] }[]
}

/** 讲义列表项。 */
export type HandoutSummary = { slug: string; title: string }

/** 讲义详情。 */
export type HandoutDetail = HandoutSummary & { markdown: string }

/** 讲详情：讲稿与视频对象 key。 */
export type LessonDetail = {
  slug: string
  title: string
  scriptMarkdown: string
  videoKey: string
  subtitleKey: string | null
  courseSlug: string
  courseTitle: string
  chapterTitle: string
}

export type ApiResult<T> =
  | { status: "ok"; data: T }
  | { status: "not-found" }
  | { status: "invalid" }
  | { status: "error" }

export async function fetchCatalog<T>(path: string, signal: AbortSignal): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, { signal, headers: { accept: "application/json" } })
    if (response.status === 404) return { status: "not-found" }
    if (response.status === 400) return { status: "invalid" }
    if (!response.ok) return { status: "error" }
    return { status: "ok", data: (await response.json()) as T }
  } catch {
    return { status: "error" }
  }
}
