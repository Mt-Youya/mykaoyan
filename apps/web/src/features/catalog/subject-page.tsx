import { Link } from "@tanstack/react-router"

import { SubmissionsPanel } from "../submissions"
import type { CourseSummary, HandoutSummary } from "./api"
import { LoadGuard } from "./ui"
import { useCatalog } from "./use-catalog"

const eyebrow = "text-[0.8125rem] tracking-[0.08em] text-muted-foreground"
const lede = "max-w-[42rem] text-muted-foreground"
const sectionHeading = "mb-3.5 border-b border-border pb-2 text-[1.15rem]"
const card =
  "grid gap-1 rounded-xl border border-border bg-card px-[1.1rem] py-4 no-underline transition-colors hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"

/** 某考试科目的课程与讲义入口。 */
export function SubjectPage({ code }: { code: string }) {
  const query = `subject=${encodeURIComponent(code)}`
  const courses = useCatalog<CourseSummary[]>(`/api/courses?${query}`)
  const handouts = useCatalog<HandoutSummary[]>(`/api/handouts?${query}`)
  const invalid = courses.status === "invalid" || handouts.status === "invalid"

  return (
    <main className="page-container py-8 reading:py-16">
      <header className="grid gap-2">
        <p className={eyebrow}>考试科目</p>
        <h1 className="text-section leading-tight">{code}</h1>
        <p className={lede}>课程按章与讲排列；讲义是单独发布的内容。</p>
      </header>
      {invalid ? (
        <p className="text-muted-foreground" role="alert">
          考试科目代码无效，请使用三位数字代码。
        </p>
      ) : (
        <>
          <section className="mt-9 reading:mt-12" aria-labelledby="courses-heading">
            <h2 id="courses-heading" className={sectionHeading}>
              课程
            </h2>
            <LoadGuard state={courses}>
              {(items) =>
                items.length > 0 ? (
                  <ul className="grid gap-3">
                    {items.map((course) => (
                      <li key={course.slug}>
                        <Link className={card} to="/courses/$slug" params={{ slug: course.slug }}>
                          <span className="font-semibold wrap-break-word">{course.title}</span>
                          <span className="text-[0.9375rem] text-muted-foreground">{course.summary}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">这个考试科目下还没有已上架的课程。</p>
                )
              }
            </LoadGuard>
          </section>
          <section className="mt-9 reading:mt-12" aria-labelledby="handouts-heading">
            <h2 id="handouts-heading" className={sectionHeading}>
              讲义
            </h2>
            <LoadGuard state={handouts}>
              {(items) =>
                items.length > 0 ? (
                  <ul className="grid gap-3">
                    {items.map((handout) => (
                      <li key={handout.slug}>
                        <Link className={card} to="/handouts/$slug" params={{ slug: handout.slug }}>
                          <span className="font-semibold wrap-break-word">{handout.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">这个考试科目下还没有已上架的讲义。</p>
                )
              }
            </LoadGuard>
          </section>
          <SubmissionsPanel key={code} subjectCode={code} />
        </>
      )}
    </main>
  )
}
