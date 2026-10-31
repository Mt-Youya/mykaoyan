import { useCallback, useEffect, useState } from "react"

import { Badge, Button, Textarea } from "@mykaoyan/ui"

import { Markdown } from "../catalog"
import { fetchAdminPaper, fetchAdminPapers, reviewPaper, reviewPayload, setListing } from "./api"
import type { AdminPaperDetail, AdminPaperQueueItem, PaperReviewStatus } from "./api"

const eyebrow = "text-[0.8125rem] tracking-[0.08em] text-muted-foreground"
const note = "text-[0.95rem] opacity-[0.75]"
const row = "grid gap-2 rounded-lg border border-border p-3"

const reviewOptions: { value: "" | PaperReviewStatus; label: string }[] = [
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已驳回" },
  { value: "", label: "全部" },
]

export function adminPaperReviewLabel(status: PaperReviewStatus): string {
  return status === "pending" ? "待审核" : status === "rejected" ? "已驳回" : "已通过"
}

/** 社区关闭时通过只记录审核结果、不自动上架；审核页需要明确提示。 */
export function communityNote(enabled: boolean): string | null {
  return enabled ? null : "社区尚未开放：审核通过只记录结果，不会自动上架；开放后需再单独上架。"
}

/** 单条待审/已审用户试卷：预览、通过/驳回（驳回必填原因）与上下架。 */
export function AdminPaperRow(props: {
  paper: AdminPaperQueueItem
  communityEnabled: boolean
  pending: boolean
  detail: AdminPaperDetail | null
  onPreview: () => void
  onApprove: () => void
  onReject: (reason: string) => void
  onToggleListing: () => void
}) {
  const { paper } = props
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")

  return (
    <li className={row}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold wrap-break-word">{paper.title}</span>
        <Badge variant={paper.reviewStatus === "approved" ? "secondary" : "outline"}>
          {adminPaperReviewLabel(paper.reviewStatus)}
        </Badge>
        <Badge variant={paper.listed ? "secondary" : "outline"}>{paper.listed ? "已上架" : "未上架"}</Badge>
        <Badge variant="outline">用户投稿</Badge>
      </div>
      <p className={note}>
        考试科目 {paper.subjectCode} · {paper.year} 年 · 共 {paper.questionCount} 题 · {paper.author} · 提交于{" "}
        {paper.createdAt.slice(0, 10)}
        {paper.rightsConfirmedAt ? ` · 已确认权利声明` : ""}
      </p>
      {paper.reviewReason ? <p>驳回原因：{paper.reviewReason}</p> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" className="min-h-11" onClick={props.onPreview}>
          {props.detail ? "收起审核内容" : "预览审核内容"}
        </Button>
        {paper.reviewStatus === "pending" ? (
          <>
            <Button type="button" className="min-h-11" disabled={props.pending} onClick={props.onApprove}>
              通过
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={props.pending}
              onClick={() => setRejecting(!rejecting)}
            >
              {rejecting ? "取消驳回" : "驳回"}
            </Button>
          </>
        ) : null}
        {paper.reviewStatus === "approved" ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={props.pending || (!paper.listed && !props.communityEnabled)}
            onClick={props.onToggleListing}
          >
            {paper.listed ? "下架" : "上架"}
          </Button>
        ) : null}
      </div>
      {rejecting ? (
        <div className="grid gap-2">
          <label className="grid gap-1.5 text-[0.95rem]">
            <span>驳回原因（1–500 字，本人可见）</span>
            <Textarea value={reason} rows={2} onChange={(event) => setReason(event.target.value)} />
          </label>
          <Button
            type="button"
            className="min-h-11 justify-self-start"
            disabled={props.pending}
            onClick={() => {
              props.onReject(reason)
              setRejecting(false)
            }}
          >
            确认驳回
          </Button>
        </div>
      ) : null}
      {props.detail ? (
        <ol className="mt-2 grid gap-3 border-t border-border pt-3">
          {props.detail.questions.map((question) => (
            <li key={question.number} className="grid gap-2">
              <p className="text-[0.95rem] font-medium">
                第 {question.number} 题 · {question.type}
                {question.score === null ? "" : ` · ${question.score} 分`}
              </p>
              <Markdown markdown={question.stemMarkdown} />
              {question.options ? (
                <ul className="grid gap-1">
                  {question.options.map((option) => (
                    <li key={option.label} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
                      <span className="font-medium">{option.label}.</span>
                      <Markdown markdown={option.markdown} />
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-[0.95rem]">
                <span className="font-medium">答案：</span>
                {question.answerMarkdown}
              </p>
              {question.analysisMarkdown ? (
                <p className="text-[0.95rem]">
                  <span className="font-medium">解析：</span>
                  {question.analysisMarkdown}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  )
}

/** 管理后台「用户试卷审核」：待审列表、完整预览、通过/驳回与上下架。 */
export function AdminPapersPanel() {
  const [filter, setFilter] = useState<"" | PaperReviewStatus>("pending")
  const [items, setItems] = useState<AdminPaperQueueItem[] | null>(null)
  const [communityEnabled, setCommunityEnabled] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [detail, setDetail] = useState<AdminPaperDetail | null>(null)
  const [previewSlug, setPreviewSlug] = useState<string | null>(null)
  const [pendingSlug, setPendingSlug] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await fetchAdminPapers(filter || undefined)
    if (result.status !== "ok") {
      setItems([])
      setMessage(
        result.status === "forbidden"
          ? "当前账号不是管理员，无法进入试卷审核。"
          : result.status === "unauthorized"
            ? "请先登录。"
            : "试卷审核列表加载失败，请刷新页面重试。",
      )
      return
    }
    setItems(result.data.items)
    setCommunityEnabled(result.data.enabled)
    setHasMore(result.data.hasMore)
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  async function preview(slug: string) {
    if (previewSlug === slug) {
      setPreviewSlug(null)
      setDetail(null)
      return
    }
    const result = await fetchAdminPaper(slug)
    if (result.status !== "ok") {
      setMessage("试卷预览加载失败")
      return
    }
    setPreviewSlug(slug)
    setDetail(result.data)
  }

  async function act(slug: string, decision: "approve" | "reject", reason = "") {
    const payload = reviewPayload(decision, reason)
    if (!payload.ok) {
      setMessage(payload.message)
      return
    }
    setPendingSlug(slug)
    setMessage(null)
    const result = await reviewPaper(slug, payload.body)
    setPendingSlug(null)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    await load()
  }

  async function toggleListing(paper: AdminPaperQueueItem) {
    setPendingSlug(paper.slug)
    setMessage(null)
    const result = await setListing("paper", paper.slug, !paper.listed)
    setPendingSlug(null)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    await load()
  }

  const notice = communityNote(communityEnabled)
  return (
    <section className="mt-9 reading:mt-12" aria-labelledby="admin-user-papers">
      <h2 id="admin-user-papers" className="mb-3 text-[1.15rem]">
        用户试卷审核
      </h2>
      <p className={note}>
        用户试卷先审后发：通过后在社区开放时自动上架；驳回必须填写原因。答案与解析只在预览中出现，不进入公开题面。
      </p>
      {notice ? (
        <p className="my-3 text-[0.95rem]" role="status">
          {notice}
        </p>
      ) : null}
      <label className="my-3 flex flex-wrap items-center gap-2 text-[0.95rem]">
        <span>审核状态</span>
        <select
          className="h-9 rounded-md border border-input bg-transparent px-2.5 text-base md:text-sm"
          value={filter}
          onChange={(event) => setFilter(event.target.value as "" | PaperReviewStatus)}
        >
          {reviewOptions.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {message ? (
        <p className="my-3 text-[0.95rem]" role="alert">
          {message}
        </p>
      ) : null}
      {items === null ? (
        <p className={note}>正在加载…</p>
      ) : items.length ? (
        <ul className="flex flex-col gap-3">
          {items.map((paper) => (
            <AdminPaperRow
              key={paper.slug}
              paper={paper}
              communityEnabled={communityEnabled}
              pending={pendingSlug === paper.slug}
              detail={previewSlug === paper.slug ? detail : null}
              onPreview={() => void preview(paper.slug)}
              onApprove={() => void act(paper.slug, "approve")}
              onReject={(reason) => void act(paper.slug, "reject", reason)}
              onToggleListing={() => void toggleListing(paper)}
            />
          ))}
        </ul>
      ) : (
        <p className={note}>没有符合筛选条件的用户试卷。</p>
      )}
      {hasMore ? <p className={`mt-3 ${note}`}>列表只显示前 50 份；分页将在后续版本提供。</p> : null}
      <p className={`mt-3 ${eyebrow}`}>审核记录与上下架记录分开保留，不互相覆盖。</p>
    </section>
  )
}
