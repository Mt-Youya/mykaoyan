import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { Button, buttonVariants } from "@mykaoyan/ui"

import { useCatalog } from "../../features/catalog"
import type { CourseSummary, HandoutSummary } from "../../features/catalog"
import { useStudyDraft } from "../../features/profile"
import { CatalogEntries } from "./-home/catalog"
import { ProfileForm } from "./-home/profile-form"
import { StudyWorkspace } from "./-home/workspace"

const quietLink = buttonVariants({ variant: "outline", className: "min-h-12 border-border px-6 text-base" })
const primaryButton = "min-h-12 px-6 text-base"

export function HomePage() {
  const { draft, ready, notice, save } = useStudyDraft()
  const [editing, setEditing] = useState(false)
  const [browsing, setBrowsing] = useState(false)
  function edit() {
    if (!ready) return
    setEditing(true)
    setBrowsing(false)
    window.scrollTo(0, 0)
  }

  function showWorkspace() {
    setEditing(false)
    setBrowsing(false)
    window.scrollTo(0, 0)
    requestAnimationFrame(() => document.getElementById("workspace-title")?.focus({ preventScroll: true }))
  }

  return (
    <div className="min-h-svh bg-background leading-[1.7] text-foreground">
      <a
        className="fixed inset-s-4 top-4 z-10 translate-y-[-200%] bg-background p-4 focus:translate-y-0"
        href="#home-main"
      >
        跳转到主要内容
      </a>
      <header className="page-container">
        <nav
          aria-label="主导航"
          className="flex flex-wrap items-center gap-4 border-b border-border py-4 reading:min-h-24 reading:flex-nowrap reading:gap-8 reading:py-0"
        >
          <a className="mr-auto font-serif text-[1.65rem] font-semibold" href="/" aria-label="我的考研首页">
            我的考研
          </a>
          <div className="order-3 flex basis-full gap-8 reading:order-0 reading:basis-auto">
            <a
              className="inline-flex min-h-11 items-center hover:underline"
              href="#courses"
              onClick={() => setEditing(false)}
            >
              课程
            </a>
            <a
              className="inline-flex min-h-11 items-center hover:underline"
              href="#handouts"
              onClick={() => setEditing(false)}
            >
              讲义
            </a>
            <a
              className="inline-flex min-h-11 items-center hover:underline"
              href="#tracking"
              onClick={() => setEditing(false)}
            >
              我的学习
            </a>
          </div>
          <a className={quietLink} href="/login">
            登录账号
          </a>
        </nav>
      </header>

      <main id="home-main">
        {notice && (
          <div className="page-container py-4">
            <p role="alert" className="border border-border p-4 text-foreground">
              {notice}
            </p>
          </div>
        )}
        {!ready && (
          <div className="page-container py-4">
            <p role="status" className="border border-border p-4 text-foreground">
              正在读取本机备考草稿…
            </p>
          </div>
        )}
        {editing && ready ? (
          <ProfileForm
            initial={draft}
            onSave={(next) => {
              if (!save(next)) return false
              showWorkspace()
              return true
            }}
            onCancel={() => setEditing(false)}
          />
        ) : draft && !browsing ? (
          <StudyWorkspace
            key={JSON.stringify(draft)}
            draft={draft}
            onEdit={edit}
            onBrowse={() => {
              setBrowsing(true)
              window.scrollTo(0, 0)
            }}
          />
        ) : (
          <>
            {draft && (
              <div className="page-container py-4">
                <Button variant="outline" className={primaryButton} onClick={showWorkspace}>
                  返回个人工作台
                </Button>
              </div>
            )}
            <PublicReading onConfigure={edit} />
          </>
        )}
      </main>

      <footer className="page-container">
        <div className="flex flex-wrap items-center gap-4 border-t border-border py-6 text-sm reading:gap-6">
          <a className="mr-auto inline-flex min-h-11 items-center font-serif text-[1.65rem] font-semibold" href="/">
            我的考研
          </a>
          <a
            className="inline-flex min-h-11 items-center hover:underline"
            href="#courses"
            onClick={() => setEditing(false)}
          >
            课程
          </a>
          <a
            className="inline-flex min-h-11 items-center hover:underline"
            href="#handouts"
            onClick={() => setEditing(false)}
          >
            讲义
          </a>
          <a className="inline-flex min-h-11 items-center hover:underline" href="/docs/contract">
            公开契约
          </a>
          <a className="inline-flex min-h-11 items-center hover:underline" href="/login">
            登录账号
          </a>
        </div>
      </footer>
    </div>
  )
}

function PublicReading({ onConfigure }: { onConfigure: () => void }) {
  const [subject, setSubject] = useState("all")
  const mathCourses = useCatalog<CourseSummary[]>("/api/courses?subject=302")
  const csCourses = useCatalog<CourseSummary[]>("/api/courses?subject=408")
  const mathHandouts = useCatalog<HandoutSummary[]>("/api/handouts?subject=302")
  const csHandouts = useCatalog<HandoutSummary[]>("/api/handouts?subject=408")

  return (
    <>
      <section className="page-container" aria-labelledby="home-title">
        <div className="grid items-center gap-8 py-section reading:min-h-128 reading:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] reading:gap-column">
          <div>
            <h1 id="home-title" className="text-hero">
              把值得回看的，
              <br />
              留在手边。
            </h1>
            <p className="mt-8 max-w-[31em] text-muted-foreground">
              先把一个概念读清楚，再回到一讲的视频里。选好自己的考试科目，再留一处有目录、有脉络的学习空间。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button className={primaryButton} onClick={onConfigure}>
                设置我的备考
              </Button>
              <a className={quietLink} href="#courses">
                浏览课程
              </a>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">课程与讲义免费浏览，学习按自己的节奏。</p>
          </div>
          <div
            className="grid max-w-120 grid-cols-2 items-center gap-4 reading:max-w-none"
            aria-label="按考试科目进入课程与讲义"
          >
            <a
              className="flex min-h-80 flex-col gap-4 border-l-10 border-l-book-blue-spine bg-book-blue p-4 hover:outline hover:outline-offset-[3px] hover:outline-muted-foreground reading:min-h-88 reading:gap-6 reading:p-6"
              href="/subjects/302"
            >
              <span className="text-sm text-muted-foreground">考试科目 302</span>
              <span className="border-t border-t-foreground/35 pt-6 font-serif text-[2rem] leading-[1.3] reading:text-[2.6rem]">
                数学二
              </span>
              <span className="font-serif text-[1.25rem] leading-relaxed reading:text-2xl">
                高等数学
                <br />
                线性代数
              </span>
              <span className="mt-auto text-xs text-muted-foreground">查看课程与讲义</span>
            </a>
            <a
              className="flex min-h-74 flex-col gap-4 border-l-10 border-l-book-gray-spine bg-book-gray p-4 hover:outline hover:outline-offset-[3px] hover:outline-muted-foreground reading:min-h-80 reading:gap-6 reading:p-6"
              href="/subjects/408"
            >
              <span className="text-sm text-muted-foreground">考试科目 408</span>
              <span className="border-t border-t-foreground/35 pt-6 font-serif text-[2rem] leading-[1.3] reading:text-[2.6rem]">
                408
              </span>
              <span className="font-serif text-[1.25rem] leading-relaxed reading:text-2xl">
                计算机学科
                <br />
                专业基础
              </span>
              <span className="mt-auto text-xs text-muted-foreground">查看课程与讲义</span>
            </a>
          </div>
        </div>
        <p className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 border-y border-border py-6 text-sm text-muted-foreground reading:grid-cols-[6rem_minmax(0,1fr)] reading:gap-6">
          <strong className="font-medium text-foreground">阅读路径</strong>
          <span>课程讲解建立直觉，讲义整理概念，错题复测检验理解。每一步各有自己的位置。</span>
        </p>
      </section>

      <section id="courses" className="page-container" aria-labelledby="home-courses-title">
        <div className="grid gap-6 py-section reading:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] reading:gap-column">
          <div>
            <h2 id="home-courses-title" className="text-section">
              沿目录，读一讲。
            </h2>
            <p className="mt-4 text-muted-foreground">
              按考试科目整理的课程。
              <br />
              从基础概念开始，不必着急。
            </p>
          </div>
          <div>
            <fieldset className="mb-6 flex gap-2 border-0 p-0">
              <legend className="sr-only">筛选课程与讲义的考试科目</legend>
              {(
                [
                  ["all", "全部"],
                  ["302", "数学二"],
                  ["408", "408"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="relative cursor-pointer active:opacity-75">
                  <input
                    className="peer sr-only"
                    type="radio"
                    name="home-subject"
                    value={value}
                    checked={subject === value}
                    onChange={() => setSubject(value)}
                  />
                  <span className="inline-flex min-h-11 min-w-16 items-center justify-center border border-transparent px-4 peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring hover:border-border">
                    {label}
                  </span>
                </label>
              ))}
            </fieldset>
            <CatalogEntries kind="courses" subject={subject} states={{ "302": mathCourses, "408": csCourses }} />
          </div>
        </div>
      </section>

      <section id="handouts" className="border-y border-border bg-paper-soft" aria-labelledby="home-handouts-title">
        <div className="page-container py-section">
          <h2 id="home-handouts-title" className="text-section">
            手边的讲义
          </h2>
          <p className="mt-3 mb-6 text-muted-foreground">课程之外，给概念留一个可随时回看的位置。</p>
          <CatalogEntries kind="handouts" subject={subject} states={{ "302": mathHandouts, "408": csHandouts }} />
        </div>
      </section>

      <section id="tracking" className="page-container" aria-labelledby="home-tracking-title">
        <div className="grid gap-6 py-section reading:grid-cols-2 reading:items-start reading:gap-column">
          <div>
            <h2 id="home-tracking-title" className="text-section">
              学过之后，
              <br />
              还有下一次相遇。
            </h2>
            <p className="mt-6 text-muted-foreground">
              错题复测、今日待办与单词复习已可使用；学习时长、考点进度与周复盘仍在完善。
            </p>
            <p className="mt-6 text-sm text-muted-foreground">学习时长记录投入，掌握程度由独立完成的复测来印证。</p>
            <a className="mt-4 inline-flex min-h-11 items-center underline" href="/docs/contract">
              了解公开契约
            </a>
          </div>
          <div className="border border-border bg-note-paper p-6">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-[1.3rem]">学习追踪</h3>
              <a className="text-xs text-muted-foreground underline underline-offset-4" href="/today">
                打开今日页
              </a>
            </div>
            <dl className="mt-6">
              <div className="flex justify-between gap-4 border-t border-border py-3 text-sm">
                <dt>错题复测</dt>
                <dd className="m-0 text-muted-foreground">回到需要巩固的地方</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border py-3 text-sm">
                <dt>单词复习</dt>
                <dd className="m-0 text-muted-foreground">先复习到期卡</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border py-3 text-sm">
                <dt>每日记录</dt>
                <dd className="m-0 text-muted-foreground">给今天留一句复盘</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">
              学习追踪开放后，学习数据存于云端；词表等私有内容由你在浏览器保管。
            </p>
          </div>
        </div>
      </section>
    </>
  )
}

export const Route = createFileRoute("/(site)/")({
  head: () => ({
    meta: [
      { title: "我的考研｜我的备考与课程讲义" },
      { name: "description", content: "免费浏览数学二与 408 的课程和讲义，按自己的节奏读懂概念。" },
    ],
  }),
  component: HomePage,
})
