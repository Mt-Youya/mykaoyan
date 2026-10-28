import type { HandoutDetail } from "./api"
import { Markdown } from "./markdown"
import { useCatalog } from "./use-catalog"
import { Breadcrumb, LoadGuard } from "./ui"

const eyebrow = "text-[0.8125rem] tracking-[0.08em] text-muted-foreground"

/** 讲义详情：GFM 与数学公式的 Markdown 渲染。 */
export function HandoutPage({ slug }: { slug: string }) {
  const handout = useCatalog<HandoutDetail>(`/api/handouts/${encodeURIComponent(slug)}`)

  return (
    <main className="page-container py-8 reading:py-16">
      <LoadGuard state={handout}>
        {(data) => (
          <>
            <header className="grid gap-2">
              <Breadcrumb items={[{ label: "我的考研", href: "/" }, { label: data.title }]} />
              <p className={eyebrow}>讲义</p>
              <h1 className="text-section leading-tight">{data.title}</h1>
            </header>
            <Markdown markdown={data.markdown} />
          </>
        )}
      </LoadGuard>
    </main>
  )
}
