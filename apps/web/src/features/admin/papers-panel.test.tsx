import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { reviewPayload } from "./api"
import type { AdminPaperDetail, AdminPaperQueueItem } from "./api"
import { adminPaperReviewLabel, AdminPaperRow, communityNote } from "./papers-panel"

/** 虚构待审用户试卷：仓库与测试不出现真实真题内容。 */
const pendingPaper: AdminPaperQueueItem = {
  slug: "u-0123456789ab",
  title: "虚构待审试卷",
  year: 2099,
  subjectCode: "302",
  origin: "user",
  reviewStatus: "pending",
  listed: false,
  questionCount: 1,
  ownerAccountId: "00000000-0000-0000-0000-000000000001",
  author: "考生 000001",
  rightsConfirmedAt: "2026-10-31T00:00:00.000Z",
  createdAt: "2026-10-31T01:00:00.000Z",
  reviewedAt: null,
  reviewReason: null,
}

const detail: AdminPaperDetail = {
  ...pendingPaper,
  questions: [
    {
      number: 1,
      type: "单选",
      score: 2,
      topics: ["虚构考点"],
      stemMarkdown: "虚构题面",
      options: [
        { label: "A", markdown: "虚构选项 A" },
        { label: "B", markdown: "虚构选项 B" },
      ],
      answerMarkdown: "虚构答案 A",
      analysisMarkdown: "虚构解析",
    },
  ],
}

function row(
  paper: AdminPaperQueueItem,
  options: { communityEnabled?: boolean; detail?: AdminPaperDetail | null } = {},
) {
  return (
    <AdminPaperRow
      paper={paper}
      communityEnabled={options.communityEnabled ?? true}
      pending={false}
      detail={options.detail ?? null}
      onPreview={() => {}}
      onApprove={() => {}}
      onReject={() => {}}
      onToggleListing={() => {}}
    />
  )
}

describe("管理后台用户试卷审核", () => {
  it("审核请求体：通过不需要原因，驳回必须填写 1–500 字原因", () => {
    expect(reviewPayload("approve", "")).toEqual({ ok: true, body: { decision: "approve" } })
    expect(reviewPayload("reject", "   ")).toMatchObject({ ok: false })
    const rejected = reviewPayload("reject", "  虚构驳回原因  ")
    expect(rejected).toEqual({ ok: true, body: { decision: "reject", reason: "虚构驳回原因" } })
    expect(reviewPayload("reject", "虚".repeat(501))).toMatchObject({ ok: false })
  })

  it("待审试卷显示通过/驳回与预览入口，未预览时不渲染答案", () => {
    const html = renderToStaticMarkup(row(pendingPaper))
    expect(html).toContain("虚构待审试卷")
    expect(html).toContain("待审核")
    expect(html).toContain("用户投稿")
    expect(html).toContain("通过")
    expect(html).toContain("驳回")
    expect(html).toContain("预览审核内容")
    expect(html).toContain("考生 000001")
    expect(html).not.toContain("虚构答案 A")
  })

  it("预览审核内容时渲染题面与答案，供管理员判断", () => {
    const html = renderToStaticMarkup(row(pendingPaper, { detail }))
    expect(html).toContain("虚构题面")
    expect(html).toContain("虚构选项 A")
    expect(html).toContain("虚构答案 A")
    expect(html).toContain("虚构解析")
    expect(html).toContain("收起审核内容")
  })

  it("已通过试卷可上下架；社区关闭时未上架试卷的上架按钮禁用", () => {
    const approved = { ...pendingPaper, reviewStatus: "approved" as const, listed: true }
    expect(renderToStaticMarkup(row(approved))).toContain("下架")
    const waiting = { ...approved, listed: false }
    const closed = renderToStaticMarkup(row(waiting, { communityEnabled: false }))
    expect(closed).toContain("上架")
    expect(closed).toContain("disabled")
    expect(communityNote(false)).toContain("不会自动上架")
    expect(communityNote(true)).toBeNull()
  })

  it("状态文案与驳回原因在管理员视图可见", () => {
    expect(adminPaperReviewLabel("pending")).toBe("待审核")
    expect(adminPaperReviewLabel("approved")).toBe("已通过")
    expect(adminPaperReviewLabel("rejected")).toBe("已驳回")
    const rejected = {
      ...pendingPaper,
      reviewStatus: "rejected" as const,
      reviewReason: "虚构驳回原因",
      reviewedAt: "2026-10-31T02:00:00.000Z",
    }
    expect(renderToStaticMarkup(row(rejected))).toContain("虚构驳回原因")
  })
})
