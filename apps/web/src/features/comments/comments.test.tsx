import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, it, expect, vi } from "vitest"
import { CommentCard } from "./comments-panel"
import { MembershipHelp } from "../membership"
import { commentRequest } from "./api"
const item = {
  id: "fictional-comment",
  parentId: null,
  author: "虚构考生",
  body: "<script>private-marker</script>",
  deleted: false,
  createdAt: "2030-01-01T00:00:00Z",
  parent: null,
}
afterEach(() => vi.unstubAllGlobals())
describe("评论展示与开通说明", () => {
  it("评论按文本转义，删除时仅显示已删除而不包含原文", () => {
    const normal = renderToStaticMarkup(<CommentCard item={item} />)
    expect(normal).toContain("&lt;script&gt;")
    expect(normal).not.toContain("<script>")
    const deleted = renderToStaticMarkup(<CommentCard item={{ ...item, deleted: true }} />)
    expect(deleted).toContain("已删除")
    expect(deleted).not.toContain("private-marker")
  })
  it("会员入口的访客和非会员提示都能进入实际兑换位置", () => {
    const guest = renderToStaticMarkup(<MembershipHelp guest />),
      nonmember = renderToStaticMarkup(<MembershipHelp />)
    expect(guest).toContain("请先登录")
    expect(nonmember).toContain("需要有效会员")
    for (const html of [guest, nonmember]) {
      expect(html).toContain("/login#membership")
      expect(html).toContain("管理员手动开通")
      expect(html).toContain("兑换码")
    }
  })
  it("拒绝请求不当作成功，401/403保留状态供入口切换", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: "评论需要有效会员" }), { status: 403 }))
    )
    await expect(commentRequest("lessons/example/comments", "POST", { body: "虚构" })).rejects.toMatchObject({
      status: 403,
      message: "评论需要有效会员",
    })
  })
})
