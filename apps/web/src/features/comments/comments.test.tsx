import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MembershipHelp } from "../membership"
import { AdminPaperCommentsPanel, adminPaperCommentsPath, paperCommentsAdminHref } from "./admin-paper-comments"
import { commentRequest } from "./api"
import { CommentCard } from "./comments-panel"
import { paperCommentAccess, PaperCommentsPanel, paperCommentsPath } from "./paper-comments-panel"
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
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: "评论需要有效会员" }), { status: 403 })),
    )
    await expect(commentRequest("lessons/example/comments", "POST", { body: "虚构" })).rejects.toMatchObject({
      status: 403,
      message: "评论需要有效会员",
    })
  })
})
describe("试卷评论三态、地址与管理入口", () => {
  it("访客需登录、非会员需会员、会员与试卷上传者本人可评论", () => {
    expect(paperCommentAccess(null)).toEqual({ access: "guest", canComment: false, owner: false })
    expect(paperCommentAccess({ signedIn: false, member: false, owner: false })).toEqual({
      access: "guest",
      canComment: false,
      owner: false,
    })
    expect(paperCommentAccess({ signedIn: true, member: false, owner: false })).toEqual({
      access: "nonmember",
      canComment: false,
      owner: false,
    })
    expect(paperCommentAccess({ signedIn: true, member: true, owner: false })).toEqual({
      access: "member",
      canComment: true,
      owner: false,
    })
    // 上传者例外优先于会员期：非会员上传者同样可以评论，并标记为本人。
    expect(paperCommentAccess({ signedIn: true, member: false, owner: true })).toEqual({
      access: "member",
      canComment: true,
      owner: true,
    })
  })
  it("试卷评论地址编码 slug；管理端按来源选择真题或社区页面", () => {
    expect(paperCommentsPath("u-0123456789ab", 2)).toBe("papers/u-0123456789ab/comments?page=2")
    expect(paperCommentsPath("u-0123456789ab")).toBe("papers/u-0123456789ab/comments")
    expect(paperCommentsPath("a/b")).toBe("papers/a%2Fb/comments")
    expect(adminPaperCommentsPath(0, "虚构 关键词", "deleted")).toBe(
      "admin/paper-comments?page=0&q=%E8%99%9A%E6%9E%84%20%E5%85%B3%E9%94%AE%E8%AF%8D&state=deleted",
    )
    expect(paperCommentsAdminHref({ paperSlug: "u-0123456789ab", paperOrigin: "user" })).toBe(
      "/community/papers/u-0123456789ab",
    )
    expect(paperCommentsAdminHref({ paperSlug: "fictional-admin", paperOrigin: "admin" })).toBe(
      "/exams/fictional-admin",
    )
  })
  it("评论区与管理面板初次渲染显示读取状态，不提前渲染表单", () => {
    const comments = renderToStaticMarkup(<PaperCommentsPanel slug="u-0123456789ab" />)
    expect(comments).toContain("正在读取评论")
    expect(comments).not.toContain("发送评论")
    const admin = renderToStaticMarkup(<AdminPaperCommentsPanel />)
    expect(admin).toContain("试卷评论管理")
    expect(admin).toContain("正在读取试卷评论")
    expect(admin).not.toContain("确认删除")
  })
})
