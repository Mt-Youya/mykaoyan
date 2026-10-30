export type CommentItem = {
  id: string
  parentId: string | null
  author: string
  body: string
  deleted: boolean
  createdAt: string
  parent: { id: string; author: string; body: string } | null
}
export type CommentList = { enabled: boolean; items: CommentItem[]; hasMore: boolean }
export type AdminComment = CommentItem & {
  lessonSlug: string
  deletedAt: string | null
  deletedBy: string | null
  deleteReason: string | null
}
export class CommentRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function commentRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/${path}`, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    throw new CommentRequestError(0, "网络请求失败；提交结果可能未确认，请刷新核对后再操作")
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { title?: string } | null
    throw new CommentRequestError(
      response.status,
      typeof problem?.title === "string" ? problem.title : "评论操作失败，请稍后重试",
    )
  }
  return (await response.json()) as T
}
