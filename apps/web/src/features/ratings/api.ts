export type OwnRating = { stars: number | null; isOwn: boolean }
export class RatingRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function ratingRequest(id: string, method = "GET", body?: { stars: number }): Promise<OwnRating> {
  let response: Response
  try {
    response = await fetch(`/api/submissions/${encodeURIComponent(id)}/rating`, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    throw new RatingRequestError(0, "网络请求失败，评分结果可能未确认；请重新打开评分核对")
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { title?: string } | null
    throw new RatingRequestError(
      response.status,
      typeof problem?.title === "string" ? problem.title : "评分暂不可用，请刷新后再试",
    )
  }
  return response.json() as Promise<OwnRating>
}
