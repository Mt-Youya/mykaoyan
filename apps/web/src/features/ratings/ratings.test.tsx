import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ratingRequest } from "./api"
import { RatingControl } from "./control"
import { RatingStats } from "./stats"
afterEach(() => vi.unstubAllGlobals())
describe("评分显示与请求", () => {
  it("显示人数和两位加权分，推荐只按服务端标志展示", () => {
    const html = renderToStaticMarkup(<RatingStats value={{ ratingCount: 5, weightedScore: 4, recommended: true }} />)
    expect(html).toContain("5人评分")
    expect(html).toContain("4.00")
    expect(html).toContain("推荐")
    const rounded = renderToStaticMarkup(
      <RatingStats value={{ ratingCount: 5, weightedScore: 3.99999, recommended: false }} />,
    )
    expect(rounded).toContain("4.00")
    expect(rounded).not.toContain("推荐")
  })
  it("未登录评分入口存在，点击前不显示可提交表单", () => {
    const html = renderToStaticMarkup(<RatingControl submissionId="fictional" access="guest" onSaved={() => {}} />)
    expect(html).toContain("评分")
    expect(html).not.toContain("保存评分")
  })
  it("写入只发星数，拒绝保留403供开通说明处理", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ title: "评分需要有效会员" }), { status: 403 }))
    vi.stubGlobal("fetch", fetch)
    await expect(ratingRequest("fictional", "PUT", { stars: 4 })).rejects.toMatchObject({
      status: 403,
      message: "评分需要有效会员",
    })
    expect(fetch).toHaveBeenCalledWith(
      "/api/submissions/fictional/rating",
      expect.objectContaining({ method: "PUT", credentials: "same-origin", body: '{"stars":4}' }),
    )
  })
})
