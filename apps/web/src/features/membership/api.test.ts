import { afterEach, describe, expect, it, vi } from "vitest"

import { membershipRequest } from "./api"
afterEach(() => vi.unstubAllGlobals())
describe("会员请求错误与会话", () => {
  it("用同站会话发送兑换，只把兑换码放到请求体", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ endsAt: "2030-01-01T00:00:00Z" })))
    vi.stubGlobal("fetch", fetcher)
    await membershipRequest("membership/redeem", { code: "fictional" })
    expect(fetcher).toHaveBeenCalledWith(
      "/api/membership/redeem",
      expect.objectContaining({
        credentials: "same-origin",
        method: "POST",
        body: JSON.stringify({ code: "fictional" }),
      }),
    )
  })
  it("网络失败与401给出可见错误，兑换冲突不当作成功", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-network-error")))
    await expect(membershipRequest("membership")).rejects.toThrow("网络连接失败")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })))
    await expect(membershipRequest("membership")).rejects.toThrow("请先登录")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: "兑换码不存在或已兑换" }), { status: 409 })),
    )
    await expect(membershipRequest("membership/redeem", { code: "fictional" })).rejects.toThrow("已兑换")
  })
})
