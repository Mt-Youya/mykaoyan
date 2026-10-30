import { Breadcrumb, Markdown } from "../catalog"
import type { PaperDetail } from "./api"
import { usePapers } from "./use-papers"

/** 试卷题面：只有题面与选项，答案按钮进入登录后的答案页。 */
export function PaperPage({ slug }: { slug: string }) {
  const paper = usePapers<PaperDetail>(`/api/papers/${encodeURIComponent(slug)}`)

  if (paper.status === "loading") return <p className="page-container py-10 text-muted-foreground">正在加载…</p>
  if (paper.status !== "ok")
    return (
      <p className="page-container py-10 text-muted-foreground" role="status">
        {paper.status === "not-found" ? "试卷不存在或尚未上架。" : "试卷暂时无法加载，请稍后重试。"}
      </p>
    )

  const data = paper.data
  return (
    <main className="page-container py-8 reading:py-16">
      <header className="grid gap-2">
        <Breadcrumb
          items={[{ label: "我的考研", href: "/" }, { label: "真题", href: "/exams" }, { label: data.title }]}
        />
        <p className="text-[0.8125rem] tracking-[0.08em] text-muted-foreground">真题 · {data.subjectCode}</p>
        <h1 className="text-section leading-tight">{data.title}</h1>
        <p className="text-[0.95rem] opacity-[0.75]">
          {data.year} 年 · 共 {data.questionCount} 题{data.sourceNote ? ` · ${data.sourceNote}` : ""}
        </p>
      </header>
      <ol className="mt-8 grid gap-5">
        {data.questions.map((question) => (
          <li key={question.number} className="grid gap-4 rounded-xl border border-border bg-card px-5 py-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[1.2rem]">第 {question.number} 题</h2>
              <span className="text-[0.95rem] opacity-[0.75]">
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
      <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-border pt-6">
        <a
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-6 text-[0.95rem] hover:bg-muted"
          href={`/exams/${encodeURIComponent(data.slug)}/answers`}
        >
          查看答案与解析
        </a>
        <span className="text-[0.95rem] opacity-[0.75]">答案页需要登录后查看。</span>
      </div>
    </main>
  )
}
