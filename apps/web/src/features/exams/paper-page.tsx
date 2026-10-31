import { Breadcrumb, Markdown } from "../catalog"
import { PaperCommentsPanel } from "../comments"
import type { PaperDetail, PapersState } from "./api"
import { usePapers } from "./use-papers"

const questionCard = "grid gap-4 rounded-xl border border-border bg-card px-5 py-6"
const note = "text-[0.95rem] opacity-[0.75]"
const quietButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-6 text-[0.95rem] hover:bg-muted"

/** 题目列表：只渲染题面与选项；答案与解析不出现在题面页。 */
function PaperQuestions({ data }: { data: PaperDetail }) {
  return (
    <ol className="mt-8 grid gap-5">
      {data.questions.map((question) => (
        <li key={question.number} className={questionCard}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[1.2rem]">第 {question.number} 题</h2>
            <span className={note}>
              {question.type}
              {question.score === null ? "" : ` · ${question.score} 分`}
              {question.topics?.length ? ` · ${question.topics.join("、")}` : ""}
            </span>
          </div>
          <Markdown markdown={question.stemMarkdown} />
          {question.options && (
            <ul className="grid gap-2">
              {question.options.map((item) => (
                <li key={item.label} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
                  <span className="font-medium">{item.label}.</span>
                  <Markdown markdown={item.markdown} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  )
}

export type PaperPageViewProps = { state: PapersState<PaperDetail>; community?: boolean }

/** 题面页：真题（`/exams`）与用户投稿（`/community/papers`）共用，只有面包屑与文案不同。 */
export function PaperPageView({ state, community = false }: PaperPageViewProps) {
  if (state.status === "loading") return <p className="page-container py-10 text-muted-foreground">正在加载…</p>
  if (state.status !== "ok")
    return (
      <p className="page-container py-10 text-muted-foreground" role="status">
        {state.status === "not-found" ? "试卷不存在或尚未上架。" : "试卷暂时无法加载，请稍后重试。"}
      </p>
    )

  const data = state.data
  const base = community ? "/community/papers" : "/exams"
  const section = community ? "用户投稿试卷" : "真题"
  return (
    <main className="page-container py-8 reading:py-16">
      <header className="grid gap-2">
        <Breadcrumb items={[{ label: "我的考研", href: "/" }, { label: section, href: base }, { label: data.title }]} />
        <p className="text-[0.8125rem] tracking-[0.08em] text-muted-foreground">
          {community ? "用户投稿" : "真题"} · {data.subjectCode}
        </p>
        <h1 className="text-section leading-tight">{data.title}</h1>
        <p className={note}>
          {data.year} 年 · 共 {data.questionCount} 题{data.sourceNote ? ` · ${data.sourceNote}` : ""}
        </p>
        {community ? <p className={note}>本卷来自考生投稿，经审核后公开；审核通过不代表授权确认。</p> : null}
      </header>
      <PaperQuestions data={data} />
      <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-border pt-6">
        <a className={quietButton} href={`${base}/${encodeURIComponent(data.slug)}/answers`}>
          查看答案与解析
        </a>
        <span className={note}>
          {community ? "答案页需要登录；仅会员、本卷上传者本人或管理员可见。" : "答案页需要登录后查看。"}
        </span>
      </div>
      <PaperCommentsPanel slug={data.slug} />
    </main>
  )
}

/** 试卷题面：只有题面与选项，答案入口进入登录后的答案页。 */
export function PaperPage({ slug, community = false }: { slug: string; community?: boolean }) {
  const paper = usePapers<PaperDetail>(`/api/papers/${encodeURIComponent(slug)}`)
  return <PaperPageView state={paper} community={community} />
}
