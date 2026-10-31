import { Breadcrumb, Markdown } from "../catalog"
import type { PaperAnswers, PapersState } from "./api"
import { usePapers } from "./use-papers"

const eyebrow = "text-[0.8125rem] tracking-[0.08em] text-muted-foreground"
const note = "text-[0.95rem] opacity-[0.75]"
const questionCard = "grid gap-4 rounded-xl border border-border bg-card px-5 py-6"
const answerBlock = "grid gap-2 border-t border-border pt-4"
const quietButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-6 text-[0.95rem] hover:bg-muted"

/** 用户投稿答案页的 SEO 标记：答案不进 sitemap 与搜索，也不进题面页/列表。 */
export const communityPaperAnswersHead = {
  meta: [{ title: "用户投稿试卷答案 · 我的考研" }, { name: "robots", content: "noindex, nofollow" }],
}

export type PaperAnswersPageViewProps = { state: PapersState<PaperAnswers>; community?: boolean }

/** 答案页：未登录只显示登录入口；非会员且不是上传者时只显示会员入口，不渲染答案。 */
export function PaperAnswersPageView({ state, community = false }: PaperAnswersPageViewProps) {
  const base = community ? "/community/papers" : "/exams"
  const section = community ? "用户投稿试卷" : "真题"
  if (state.status === "loading") return <p className="page-container py-10 text-muted-foreground">正在加载…</p>
  if (state.status === "unauthorized")
    return (
      <main className="page-container py-10">
        <p className="text-muted-foreground">答案与解析需要登录后查看。</p>
        <a className={`${quietButton} mt-4`} href="/login">
          去登录
        </a>
      </main>
    )
  if (state.status === "forbidden")
    return (
      <main className="page-container py-10">
        <p className="text-muted-foreground">查看答案与解析需要有效会员；试卷上传者本人可以查看自己上传试卷的答案。</p>
        <a className={`${quietButton} mt-4`} href="/login#membership">
          开通会员
        </a>
      </main>
    )
  if (state.status !== "ok")
    return (
      <p className="page-container py-10 text-muted-foreground" role="status">
        {state.status === "not-found" ? "试卷不存在或尚未上架。" : "答案暂时无法加载，请稍后重试。"}
      </p>
    )

  const data = state.data
  return (
    <main className="page-container py-8 reading:py-16">
      <header className="grid gap-2">
        <Breadcrumb
          items={[
            { label: "我的考研", href: "/" },
            { label: section, href: base },
            { label: data.title, href: `${base}/${encodeURIComponent(data.slug)}` },
            { label: "答案与解析" },
          ]}
        />
        <p className={eyebrow}>{community ? "用户投稿 · 答案与解析" : "真题 · 答案与解析"}</p>
        <h1 className="text-section leading-tight">{data.title} · 答案</h1>
        <p className={note}>
          {data.year} 年 · {community ? "用户投稿内容，仅供学习使用，请勿转载。" : "仅供登录考生学习使用，请勿转载。"}
        </p>
      </header>
      <ol className="mt-8 grid gap-5">
        {data.questions.map((question) => (
          <li key={question.number} className={questionCard}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[1.2rem]">第 {question.number} 题</h2>
              <span className={note}>
                {question.type}
                {question.score === null ? "" : ` · ${question.score} 分`}
              </span>
            </div>
            <Markdown markdown={question.stemMarkdown} />
            <div className={answerBlock}>
              <h3 className="text-[1.05rem]">答案</h3>
              <Markdown markdown={question.answerMarkdown} />
              {question.analysisMarkdown && (
                <>
                  <h3 className="mt-2 text-[1.05rem]">解析</h3>
                  <Markdown markdown={question.analysisMarkdown} />
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </main>
  )
}

/** 答案页入口：真题与用户投稿共用同一接口，只有路由与文案不同。 */
export function PaperAnswersPage({ slug, community = false }: { slug: string; community?: boolean }) {
  const paper = usePapers<PaperAnswers>(`/api/papers/${encodeURIComponent(slug)}/answers`)
  return <PaperAnswersPageView state={paper} community={community} />
}
