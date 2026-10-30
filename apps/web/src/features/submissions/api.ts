import { SUBMISSION_PART_SIZE, uploadPartSize } from "@mykaoyan/core"
import type { SubmissionInput } from "@mykaoyan/core"
export type Submission = {
  id: string
  title: string
  summary: string
  subjectCode: string
  topicId: string | null
  author: string
  duration: number
  status: "uploading" | "pending" | "approved" | "rejected"
  listed: boolean
  createdAt: string
}
export type OwnSubmission = Submission & {
  size: number
  fingerprint: string
  reason: string | null
  reviewedAt: string | null
  deleteMarked: boolean
  deleted: boolean
}
export type AdminSubmission = OwnSubmission & { listingChange: { actorId: string; listed: boolean; at: string } | null }
export type SubmissionList<T = Submission> = { enabled: boolean; items: T[]; hasMore: boolean }
export class SubmissionRequestError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}
export async function submissionRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/${path}`, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ?? null,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new SubmissionRequestError(0, "网络请求失败，结果可能未确认；可刷新记录或选择原文件续传")
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { title?: string } | null
    throw new SubmissionRequestError(
      response.status,
      typeof problem?.title === "string" ? problem.title : "投稿操作失败，请稍后重试"
    )
  }
  return response.json() as Promise<T>
}
function putPart(url: string, blob: Blob, signal: AbortSignal, progress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest(),
      abort = () => xhr.abort()
    const finish = (error?: Error) => {
      signal.removeEventListener("abort", abort)
      if (error) reject(error)
      else resolve()
    }
    xhr.open("PUT", url)
    xhr.timeout = 120000
    xhr.upload.onprogress = (e) => progress(e.loaded)
    xhr.onload = () =>
      finish(xhr.status >= 200 && xhr.status < 300 ? undefined : new Error("分片上传失败，请选择原文件继续上传"))
    xhr.onerror = () => finish(new Error("直传连接失败，请检查网络后续传"))
    xhr.ontimeout = () => finish(new Error("分片上传超时，可以续传"))
    xhr.onabort = () => finish(new Error("上传已暂停，可以选择原文件续传"))
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) {
      finish(new Error("上传已暂停"))
      return
    }
    xhr.send(blob)
  })
}
export async function uploadSubmission(
  file: File,
  input: SubmissionInput,
  signal: AbortSignal,
  onProgress: (percent: number) => void
) {
  const started = await submissionRequest<OwnSubmission>("submissions/uploads", "POST", input, signal)
  if (started.status !== "uploading") return started
  const saved = await submissionRequest<{ completed: boolean; parts: { number: number; size: number }[] }>(
    `submissions/${input.id}/upload`,
    "GET",
    undefined,
    signal
  )
  if (!saved.completed) {
    let uploaded = 0
    for (let part = 1; part <= Math.ceil(file.size / SUBMISSION_PART_SIZE); part++) {
      const size = uploadPartSize(file.size, part)
      if (!saved.parts.some((p) => p.number === part && p.size === size)) {
        const signed = await submissionRequest<{ url: string }>(
          `submissions/${input.id}/parts/${part}`,
          "POST",
          {},
          signal
        )
        await putPart(
          signed.url,
          file.slice((part - 1) * SUBMISSION_PART_SIZE, (part - 1) * SUBMISSION_PART_SIZE + size),
          signal,
          (loaded) => onProgress(Math.min(99, Math.round(((uploaded + loaded) / file.size) * 100)))
        )
      }
      uploaded += size
      onProgress(Math.min(99, Math.round((uploaded / file.size) * 100)))
    }
  }
  const result = await submissionRequest<OwnSubmission>(`submissions/${input.id}/complete`, "POST", {}, signal)
  onProgress(100)
  return result
}
