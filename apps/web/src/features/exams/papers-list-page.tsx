import { Breadcrumb, LoadGuard, useCatalog } from "../catalog"
import type { PaperSummary } from "./api"

const eyebrow = "text-[0.8125rem] tracking-[0.08em] text-muted-foreground"
const lede = "max-w-[42rem] text-muted-foreground"
const sectionHeading = "mb-3.5 border-b border-border pb-2 text-[1.15rem]"
const card =
  "grid gap-1 rounded-xl border border-border bg-card px-[1.1rem] py-4 no-underline transition-colors hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
const note = "text-[0.95rem] opacity-[0.75]"

const subjects = [
  { code: "302", label: "数学（二）" },
  { code: "408", label: "408 计算机学科专业基础" },
]

/** 公开真题列表：按考试科目分组；答案不在此页出现。 */
export function PapersListPage() {
  const math = useCatalog<PaperSummary[]>("/api/papers?subject=302")
  const cs = useCatalog<PaperSummary[]>("/api/papers?subject=408")
  const states = { "302": math, "408": cs }

  return (
    <main className="page-container py-8 reading:py-16">
      <header className="grid gap-2">
        <Breadcrumb items={[{ label: "我的考研", href: "/" }, { label: "真题" }]} />
        <p className={eyebrow}>真题</p>
        <h1 className="text-section leading-tight">真题试卷</h1>
        <p className={lede}>浏览已上架试卷的题面；答案与解析只在登录后的单独页面显示。</p>
      </header>
      {subjects.map(({ code, label }) => (
        <section key={code} className="mt-9 reading:mt-12" aria-labelledby={`papers-${code}`}>
          <h2 id={`papers-${code}`} className={sectionHeading}>
            {label}
          </h2>
          <LoadGuard state={states[code as keyof typeof states]}>
            {(items) =>
              items.length > 0 ? (
                <ul className="grid gap-3">
                  {items.map((paper) => (
                    <li key={paper.slug}>
                      <a className={card} href={`/exams/${encodeURIComponent(paper.slug)}`}>
                        <span className="font-semibold wrap-break-word">{paper.title}</span>
                        <span className={note}>
                          {paper.year} 年 · 共 {paper.questionCount} 题
                          {paper.sourceNote ? ` · ${paper.sourceNote}` : ""}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">这个考试科目下暂时没有已上架的真题试卷。</p>
              )
            }
          </LoadGuard>
        </section>
      ))}
    </main>
  )
}
