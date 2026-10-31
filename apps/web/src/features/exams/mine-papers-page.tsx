import { Badge, Button } from "@mykaoyan/ui"

import { Breadcrumb } from "../catalog"
import type { OwnPaper, OwnPaperList, PapersState } from "./api"
import { usePapers } from "./use-papers"

const eyebrow = "text-[0.8125rem] tracking-[0.08em] text-muted-foreground"
const note = "text-[0.95rem] opacity-[0.75]"
const card = "grid gap-2 rounded-xl border border-border bg-card px-[1.1rem] py-4"
const quietLink =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-[0.95rem] hover:bg-muted"

/** 我的试卷状态文案：审核通过但社区关闭时只记为已通过、不上架。 */
export function ownPaperStatus(paper: Pick<OwnPaper, "reviewStatus" | "listed">): string {
  if (paper.reviewStatus === "pending") return "待审核"
  if (paper.reviewStatus === "rejected") return "已驳回"
  return paper.listed ? "已通过并上架" : "已通过 · 未上架"
}

/** 我的试卷：任何状态可读，含驳回原因与题数；未上架时明确提示。 */
export function MinePapersView({ state }: { state: PapersState<OwnPaperList> }) {
  if (state.status === "loading") return <p className="page-container py-10 text-muted-foreground">正在加载…</p>
  if (state.status === "unauthorized")
    return (
      <main className="page-container py-10">
        <p className="text-muted-foreground">查看我的试卷需要先登录。</p>
        <a className={`${quietLink} mt-4`} href="/login">
          去登录
        </a>
      </main>
    )
  if (state.status !== "ok")
    return (
      <p className="page-container py-10 text-muted-foreground" role="alert">
        我的试卷暂时无法加载，请稍后重试。
      </p>
    )

  return (
    <main className="page-container py-8 reading:py-16">
      <header className="grid gap-2">
        <Breadcrumb
          items={[
            { label: "我的考研", href: "/" },
            { label: "用户投稿试卷", href: "/community/papers" },
            { label: "我的试卷" },
          ]}
        />
        <p className={eyebrow}>社区 · 用户投稿</p>
        <h1 className="text-section leading-tight">我的试卷</h1>
        <p className={note}>
          提交后不可编辑或撤回；被驳回后可重新提交一份新试卷。审核通过并由管理员上架后，其他人才看得到题面。
        </p>
        {!state.data.enabled ? <p className={note}>社区尚未开放：已通过的试卷暂不上架，本人仍可预览。</p> : null}
        <p className="flex flex-wrap gap-4">
          <a className={quietLink} href="/community/papers/new">
            提交新试卷
          </a>
          <a className={quietLink} href="/community/papers">
            浏览用户投稿试卷
          </a>
        </p>
      </header>

      {state.data.items.length ? (
        <ul className="mt-8 grid gap-4">
          {state.data.items.map((paper) => (
            <li key={paper.slug} className={card}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[1.1rem] font-semibold wrap-break-word">{paper.title}</span>
                <Badge variant={paper.reviewStatus === "approved" ? "secondary" : "outline"}>
                  {ownPaperStatus(paper)}
                </Badge>
              </div>
              <p className={note}>
                {paper.year} 年 · 考试科目 {paper.subjectCode} · 共 {paper.questionCount} 题 · 提交于{" "}
                {paper.createdAt.slice(0, 10)}
              </p>
              {paper.reviewStatus === "rejected" && paper.reviewReason ? (
                <p role="status">驳回原因：{paper.reviewReason}</p>
              ) : null}
              {paper.reviewStatus === "pending" ? <p className={note}>等待管理员审核；审核前公开页面不可见。</p> : null}
              {paper.reviewStatus === "approved" && !paper.listed ? (
                <p className={note}>审核已通过，等待管理员上架（社区开放后由管理员操作）。</p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <a className={quietLink} href={`/community/papers/${encodeURIComponent(paper.slug)}/answers`}>
                  预览答案与解析
                </a>
                {paper.reviewStatus === "approved" && paper.listed ? (
                  <a className={quietLink} href={`/community/papers/${encodeURIComponent(paper.slug)}`}>
                    打开公开页面
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-muted-foreground">还没有提交过用户试卷。</p>
      )}

      {state.data.hasMore ? (
        <p className={`mt-6 ${note}`}>只显示最近 {state.data.items.length} 份试卷；分页浏览将在后续版本提供。</p>
      ) : null}
      <div className="mt-8">
        <Button variant="outline" className="min-h-11" onClick={() => window.location.reload()}>
          刷新状态
        </Button>
      </div>
    </main>
  )
}

export function MinePapersPage() {
  const state = usePapers<OwnPaperList>("/api/papers/mine")
  return <MinePapersView state={state} />
}
