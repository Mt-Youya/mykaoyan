import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { submissionCommentAccess, SubmissionComments } from "./comments"
describe("投稿评论入口", () => {
  it("按访客、非会员、会员与投稿上传者区分评论权限", () => {
    expect(submissionCommentAccess(undefined)).toBe("login")
    expect(submissionCommentAccess({ signedIn: false, member: false, owner: false })).toBe("login")
    expect(submissionCommentAccess({ signedIn: true, member: false, owner: false })).toBe("membership")
    expect(submissionCommentAccess({ signedIn: true, member: true, owner: false })).toBe("member")
    // 上传者本人即使不是会员也能评论自己的投稿。
    expect(submissionCommentAccess({ signedIn: true, member: false, owner: true })).toBe("owner")
  })
  it("列表默认不展开评论区，避免一次读取几十个投稿的评论", () => {
    const html = renderToStaticMarkup(<SubmissionComments submissionId="fictional-submission" />)
    expect(html).toContain("查看评论")
    expect(html).not.toContain("正在读取评论")
    expect(html).not.toContain("发表评论")
  })
})
