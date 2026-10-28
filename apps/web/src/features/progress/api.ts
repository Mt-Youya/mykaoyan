import { progressFileSchema } from "@mykaoyan/core"
import type { ProgressChangeSummary, ProgressFile } from "@mykaoyan/core"

type Problem = { title?: unknown }

function message(problem: Problem | null) {
  return typeof problem?.title === "string" ? problem.title : "操作失败，请稍后重试"
}

async function readProblem(response: Response) {
  return (await response.json().catch(() => null)) as Problem | null
}

export type ProgressResponse =
  | { status: "ok"; document: ProgressFile; etag: string }
  | { status: "unauthorized" }
  | { status: "error"; message: string }

export async function fetchProgress(): Promise<ProgressResponse> {
  const response = await fetch("/api/v1/progress", { credentials: "same-origin" })
  if (response.status === 401) return { status: "unauthorized" }
  if (!response.ok) return { status: "error", message: message(await readProblem(response)) }
  const parsed = progressFileSchema.safeParse(await response.json())
  const etag = response.headers.get("etag")
  if (!parsed.success || !etag) return { status: "error", message: "学习数据响应无法识别，请稍后重试" }
  return { status: "ok", document: parsed.data, etag }
}

export type SaveProgressResponse =
  | { status: "ok"; summary: ProgressChangeSummary; etag: string }
  | { status: "conflict" }
  | { status: "error"; message: string }

export async function saveProgress(document: ProgressFile, etag: string): Promise<SaveProgressResponse> {
  const response = await fetch("/api/v1/progress", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "if-match": etag },
    body: JSON.stringify(document),
  })
  if (response.status === 412) return { status: "conflict" }
  if (!response.ok) return { status: "error", message: message(await readProblem(response)) }
  const summary = (await response.json()) as ProgressChangeSummary
  const nextEtag = response.headers.get("etag")
  if (!nextEtag) return { status: "error", message: "学习数据响应缺少版本号，请刷新后重试" }
  return { status: "ok", summary, etag: nextEtag }
}
