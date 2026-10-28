import { Link } from "@tanstack/react-router"
import type { CourseDetail } from "./api"
import { useCatalog } from "./use-catalog"
import { Breadcrumb, LoadGuard } from "./ui"

const eyebrow = "text-[0.8125rem] tracking-[0.08em] text-muted-foreground"
const lede = "max-w-[42rem] text-muted-foreground"
const sectionHeading = "mb-3.5 border-b border-border pb-2 text-[1.15rem]"
const lessonLink =
  "inline-flex min-h-11 -ml-[0.35rem] items-center rounded-[0.4rem] px-[0.35rem] wrap-break-word no-underline hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"

/** 课程详情：按顺序列出章与讲。 */
export function CoursePage({ slug }: { slug: string }) {
  const course = useCatalog<CourseDetail>(`/api/courses/${encodeURIComponent(slug)}`)

  return (
    <main className="page-container py-8 reading:py-16">
      <LoadGuard state={course}>
        {(data) => (
          <>
            <header className="grid gap-2">
              <Breadcrumb items={[{ label: "我的考研", href: "/" }, { label: data.title }]} />
              <p className={eyebrow}>课程</p>
              <h1 className="text-section leading-tight">{data.title}</h1>
              <p className={lede}>{data.summary}</p>
            </header>
            <section className="mt-9 reading:mt-12" aria-labelledby="chapters-heading">
              <h2 id="chapters-heading" className={sectionHeading}>
                章与讲
              </h2>
              {data.chapters.length > 0 ? (
                <ol className="grid gap-6 reading:gap-8">
                  {data.chapters.map((chapter, chapterIndex) => {
                    const firstLessonNumber = data.chapters
                      .slice(0, chapterIndex)
                      .reduce((total, previous) => total + previous.lessons.length, 0)
                    return (
                      <li key={`${chapterIndex}-${chapter.title}`} className="min-w-0">
                        <h3 className="mb-[0.6rem] flex items-baseline gap-[0.6rem] text-[1.05rem] leading-[1.4]">
                          <span
                            className="shrink-0 rounded-full border border-border px-[0.45rem] py-[0.05rem] text-xs font-normal tabular-nums text-muted-foreground"
                            aria-hidden="true"
                          >
                            {String(chapterIndex + 1).padStart(2, "0")}
                          </span>
                          {chapter.title}
                        </h3>
                        {chapter.lessons.length > 0 ? (
                          <ol className="grid gap-[0.15rem] pl-0 reading:pl-[1.4rem]">
                            {chapter.lessons.map((lesson, lessonIndex) => (
                              <li key={lesson.slug} className="flex min-w-0 items-baseline gap-[0.55rem]">
                                <span
                                  className="min-w-[1.4rem] shrink-0 text-right text-sm tabular-nums text-muted-foreground"
                                  aria-hidden="true"
                                >
                                  {firstLessonNumber + lessonIndex + 1}
                                </span>
                                <Link className={lessonLink} to="/lessons/$slug" params={{ slug: lesson.slug }}>
                                  {lesson.title}
                                </Link>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-muted-foreground">这一章还没有已上架的讲。</p>
                        )}
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <p className="text-muted-foreground">这门课程还没有已上架的章。</p>
              )}
            </section>
          </>
        )}
      </LoadGuard>
    </main>
  )
}
