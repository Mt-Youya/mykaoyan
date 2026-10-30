import { CommentsPanel } from "../comments"
import { LessonPlayer } from "../playback"
import type { LessonDetail } from "./api"
import { Markdown } from "./markdown"
import { useCatalog } from "./use-catalog"
import { Breadcrumb, LoadGuard } from "./ui"

const eyebrow = "text-[0.8125rem] tracking-[0.08em] text-muted-foreground"
const sectionHeading = "mb-3.5 border-b border-border pb-2 text-[1.15rem]"

/** 讲详情：视频播放器 + 讲稿 Markdown。 */
export function LessonPage({ slug }: { slug: string }) {
  const lesson = useCatalog<LessonDetail>(`/api/lessons/${encodeURIComponent(slug)}`)

  return (
    <main className="page-container py-8 reading:py-16">
      <LoadGuard state={lesson}>
        {(data) => (
          <>
            <header className="grid gap-2">
              <Breadcrumb
                items={[
                  { label: "我的考研", href: "/" },
                  { label: data.courseTitle, href: `/courses/${data.courseSlug}` },
                  { label: data.chapterTitle },
                  { label: data.title },
                ]}
              />
              <p className={eyebrow}>讲</p>
              <h1 className="text-section leading-tight">{data.title}</h1>
            </header>
            <section className="mt-9 reading:mt-12" aria-labelledby="video-heading">
              <h2 id="video-heading" className={sectionHeading}>
                视频
              </h2>
              <LessonPlayer slug={data.slug} title={data.title} />
            </section>
            <section className="mt-9 reading:mt-12" aria-labelledby="script-heading">
              <h2 id="script-heading" className={sectionHeading}>
                讲稿
              </h2>
              <Markdown markdown={data.scriptMarkdown} />
            </section>
            <CommentsPanel slug={data.slug} />
          </>
        )}
      </LoadGuard>
    </main>
  )
}
