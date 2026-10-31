import { useState } from "react"

import { Badge } from "@mykaoyan/ui"

import { Breadcrumb } from "../catalog"
import type { PaperSummary } from "./api"
import { usePapers } from "./use-papers"

const eyebrow = "text-[0.8125rem] tracking-[0.08em] text-muted-foreground"
const lede = "max-w-[42rem] text-muted-foreground"
const card =
  "grid gap-1 rounded-xl border border-border bg-card px-[1.1rem] py-4 no-underline transition-colors hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
const note = "text-[0.95rem] opacity-[0.75]"
const quietButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-6 text-[0.95rem] hover:bg-muted"

const subjects = [
  { code: "302", label: "数学（二）" },
  { code: "408", label: "408 计算机学科专业基础" },
]

/** 用户投稿试卷列表：只列已通过且上架的用户试卷，与真题列表分开。 */
export function CommunityPapersListPage() {
  const [subject, setSubject] = useState("302")
  const papers = usePapers<PaperSummary[]>(`/api/papers?subject=${subject}&origin=user`)

  return (
    <main className="page-container py-8 reading:py-16">
      <header className="grid gap-2">
        <Breadcrumb items={[{ label: "我的考研", href: "/" }, { label: "用户投稿试卷" }]} />
        <p className={eyebrow}>社区 · 用户投稿</p>
        <h1 className="text-section leading-tight">用户投稿试卷</h1>
        <p className={lede}>
          考生提交的试卷经管理员审核后公开；只显示题面，答案与解析需要登录后按会员规则查看。用户投稿试卷不等同于已获授权的真题。
        </p>
        <p className={`${note} flex flex-wrap items-center gap-x-4 gap-y-2`}>
          <a className={quietButton} href="/community/papers/new">
            提交一份试卷
          </a>
          <a className={quietButton} href="/community/papers/mine">
            我的试卷
          </a>
          <a className="underline" href="/exams">
            查看真题试卷
          </a>
        </p>
      </header>

      <fieldset className="mt-8 flex flex-wrap items-center gap-4 border-0 p-0">
        <legend className="mb-2 text-[1.05rem]">考试科目</legend>
        {subjects.map((item) => (
          <label key={item.code} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="community-paper-subject"
              value={item.code}
              checked={subject === item.code}
              onChange={() => setSubject(item.code)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </fieldset>

      <section className="mt-6" aria-label="用户投稿试卷列表">
        {papers.status === "loading" ? (
          <p className="text-muted-foreground" role="status">
            正在加载…
          </p>
        ) : papers.status !== "ok" ? (
          <p className="text-muted-foreground" role="alert">
            用户投稿试卷暂时无法加载，请稍后重试。
          </p>
        ) : papers.data.length ? (
          <ul className="grid gap-3">
            {papers.data.map((paper) => (
              <li key={paper.slug}>
                <a className={card} href={`/community/papers/${encodeURIComponent(paper.slug)}`}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold wrap-break-word">{paper.title}</span>
                    <Badge variant="outline">用户投稿</Badge>
                  </span>
                  <span className={note}>
                    {paper.year} 年 · 共 {paper.questionCount} 题{paper.sourceNote ? ` · ${paper.sourceNote}` : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">这个考试科目下暂时没有已上架的用户投稿试卷。</p>
        )}
      </section>
    </main>
  )
}
