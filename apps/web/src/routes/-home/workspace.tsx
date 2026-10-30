import { useState } from "react"

import { Button } from "@mykaoyan/ui"

import { useCatalog } from "../../features/catalog"
import type { CourseSummary, HandoutSummary } from "../../features/catalog"
import { standardSubjects } from "../../features/profile"
import type { ExamSubject, StudyDraft } from "../../features/profile"
import { CatalogEntries } from "./catalog"

const kicker = "text-sm tracking-[0.08em] text-muted-foreground"
const caption = "mt-6 max-w-[65ch] text-sm text-muted-foreground"
const buttonSize = "min-h-12 px-6 text-base"
const actions = "mt-6 flex flex-wrap gap-3"
const pillLabel = "relative cursor-pointer active:opacity-75"
const pill =
  "inline-flex min-h-11 min-w-16 items-center justify-center border border-transparent px-4 text-base hover:border-border peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring"

function SubjectCatalog({ subject, kind }: { subject: ExamSubject; kind: "courses" | "handouts" }) {
  const state = useCatalog<(CourseSummary | HandoutSummary)[]>(`/api/${kind}?subject=${subject.code}`)
  return (
    <CatalogEntries
      kind={kind}
      subject={subject.code}
      states={{ [subject.code]: state }}
      labels={{ [subject.code]: subject.name }}
    />
  )
}

export function StudyWorkspace({
  draft,
  onEdit,
  onBrowse,
}: {
  draft: StudyDraft
  onEdit: () => void
  onBrowse: () => void
}) {
  const [selected, setSelected] = useState("all")
  const active = draft.subjects.filter((s) => draft.active.includes(s.code))
  const visible = active.filter((s) => selected === "all" || s.code === selected)
  const english = draft.vocabulary && visible.some((s) => s.code === "201" || s.code === "204")
  return (
    <>
      <section id="my-study" className="page-container py-section">
        <div className="grid gap-12 wrap-anywhere reading:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] reading:items-start">
          <div>
            <p className={kicker}>我的备考 · {draft.year} 招生</p>
            <h1 id="workspace-title" tabIndex={-1} className="mt-4 mb-6 text-[clamp(2rem,3vw,3rem)]">
              把今天，
              <br />
              留给这一科。
            </h1>
            <p className="max-w-[65ch] text-muted-foreground">
              {draft.target.school || "目标院校待定"}
              {draft.target.college && ` · ${draft.target.college}`} · {draft.target.major || "专业待定"}
            </p>
            {(draft.target.direction || draft.target.mode) && (
              <p className="max-w-[65ch] text-muted-foreground">
                {[draft.target.direction, draft.target.mode].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className={caption}>完整考试科目：{draft.subjects.map((s) => `${s.code} ${s.name}`).join("、")}</p>
            <p className={caption}>仅此浏览器保存 · 尚未同步到账号</p>
            <div className={actions}>
              <Button className={buttonSize} onClick={onEdit}>
                修改备考档案
              </Button>
              <Button variant="outline" className={buttonSize} onClick={onBrowse}>
                浏览公共课程
              </Button>
            </div>
          </div>
          <aside className="border-l-[0.75rem] border-l-book-blue-spine bg-book-blue p-6 reading:p-8">
            <p className={kicker}>当前学习范围</p>
            <ul className="mt-4 mb-6">
              {active.map((s) => (
                <li key={s.code} className="flex items-baseline gap-4 border-b border-foreground/15 py-3">
                  <span className="tabular-nums">{s.code}</span>
                  <strong className="font-serif text-[1.4rem] font-medium">{s.name}</strong>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">暂未开启的科目仍保留在档案中，可随时修改学习范围。</p>
          </aside>
        </div>
      </section>
      <section className="page-container" aria-label="工作台科目范围">
        <div className="border-y border-border py-6">
          <fieldset className="mb-6 flex flex-wrap gap-2">
            <legend className="mb-4 text-base">这次打开哪一科？</legend>
            {[{ code: "all", name: "全部当前科目" }, ...active].map((s) => (
              <label key={s.code} className={pillLabel}>
                <input
                  className="peer sr-only"
                  type="radio"
                  name="workspace-subject"
                  checked={selected === s.code}
                  onChange={() => setSelected(s.code)}
                />
                <span className={pill}>{s.name}</span>
              </label>
            ))}
          </fieldset>
          <p className={caption}>以下内容只展示：{visible.map((s) => s.name).join("、")}。其他科目的记录不会删除。</p>
        </div>
      </section>
      {(
        [
          ["courses", "沿目录，读一讲。"],
          ["handouts", "手边的讲义"],
        ] as const
      ).map(([kind, title]) => (
        <section id={kind} key={kind} className="page-container py-section">
          <div className="space-y-8 wrap-anywhere">
            <h2 className="text-[1.875rem]">{title}</h2>
            {visible.map((subject) => (
              <section key={subject.code} aria-label={`${subject.name}${kind === "courses" ? "课程" : "讲义"}`}>
                <h3 className="border-b border-border pb-3 text-[1.25rem]">
                  {subject.code} · {subject.name}
                </h3>
                {standardSubjects.some((s) => s.code === subject.code) ? (
                  <SubjectCatalog subject={subject} kind={kind} />
                ) : (
                  <p className="border-t border-border py-6 text-muted-foreground">
                    自命题科目按 {draft.year} 年 · {draft.target.school} · {subject.name} 单独保留，暂未接入公共目录。
                  </p>
                )}
              </section>
            ))}
          </div>
        </section>
      ))}
      <section id="tracking" className="page-container py-section">
        <div className="grid gap-12 border-t border-border pt-6 reading:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <div>
            <p className={kicker}>我的学习</p>
            <h2 className="my-4 text-[1.875rem]">学过，再回来。</h2>
            <p className="max-w-[65ch] text-muted-foreground">
              对应 {visible.map((s) => s.name).join("、")}
              。错题、复测与今日待办会同步到登录账号；词表仍由当前浏览器自己保管。
            </p>
          </div>
          <dl>
            {[
              { label: "今日页", href: "/today", description: "按当前范围汇总复测、单词卡与今天的计划" },
              ...(english
                ? [{ label: "背单词", href: "/vocabulary", description: "英语词表与到期卡复习；词表由自己保管" }]
                : []),
              { label: "每日记录", href: "/daily", description: "各科学习时长、完成事项、明日首要任务与一句复盘" },
              { label: "错题", href: "/mistakes", description: "按当前科目整理订正与复测" },
              {
                label: "考点进度",
                href: "/topic-progress",
                description: "手动标记未测、学习中、已练；待重测与稳定由关联错题推算",
              },
              { label: "周复盘", href: "/weekly", description: "从周一开始的只读汇总，加一段下周调整" },
              { label: "备考档案与计划", href: "/plan", description: "初试日期、科目目标分、阶段分钟与按天覆盖" },
              { label: "试卷", href: "/papers", description: "按科目与年份整理来源及本人导入内容" },
              { label: "专题", href: "/topics", description: "把相同考点的课程与讲义放在一起" },
              {
                label: "院校专业",
                href: "/admissions",
                description: draft.target.school
                  ? `当前目标：${draft.target.school}；可查询招生目录、收藏并比较`
                  : "目标未定，可先查询招生目录、收藏并比较",
              },
            ].map(({ label, href, description }, index) => (
              <div key={label} className={index === 0 ? "border-b border-border pb-4" : "border-b border-border py-4"}>
                <dt className="flex items-center gap-4 font-semibold">
                  <a className="underline underline-offset-4 hover:decoration-2" href={href}>
                    {label}
                  </a>
                </dt>
                <dd className="mt-2 text-muted-foreground">{description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  )
}
