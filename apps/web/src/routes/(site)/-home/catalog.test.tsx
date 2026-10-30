import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"

import { CatalogEntries } from "./catalog"

it("一个科目已加载失败时立即给出恢复入口，不继续等待另一个科目", () => {
  const html = renderToStaticMarkup(
    <CatalogEntries
      kind="courses"
      subject="all"
      states={{ "302": { status: "error" }, "408": { status: "loading" } }}
    />,
  )
  expect(html).toContain('role="alert"')
  expect(html).toContain("重新加载")
  expect(html).not.toContain("正在加载课程")
})

it("筛选后只显示所选科目的上架目录，不受其他科目的错误影响", () => {
  const html = renderToStaticMarkup(
    <CatalogEntries
      kind="courses"
      subject="302"
      states={{
        "302": { status: "ok", data: [{ slug: "public-course", title: "公开课程甲", summary: "课程介绍" }] },
        "408": { status: "error" },
      }}
    />,
  )
  expect(html).toContain("公开课程甲")
  expect(html).toContain('href="/courses/public-course"')
  expect(html).not.toContain('role="alert"')
})

it("空讲义目录说明尚未上架，不回退到原型示例", () => {
  const html = renderToStaticMarkup(
    <CatalogEntries
      kind="handouts"
      subject="all"
      states={{ "302": { status: "ok", data: [] }, "408": { status: "ok", data: [] } }}
    />,
  )
  expect(html).toContain("还没有已上架的讲义")
  expect(html).not.toContain("导数概念速查")
})

it("加载期间不把目录渲染为空，讲义内容在完成后链接到真实阅读路由", () => {
  const loading = renderToStaticMarkup(
    <CatalogEntries
      kind="handouts"
      subject="408"
      states={{ "302": { status: "error" }, "408": { status: "loading" } }}
    />,
  )
  expect(loading).toContain("正在加载讲义")
  expect(loading).not.toContain("还没有已上架")
  const ready = renderToStaticMarkup(
    <CatalogEntries
      kind="handouts"
      subject="408"
      states={{
        "302": { status: "error" },
        "408": { status: "ok", data: [{ slug: "reading-guide", title: "阅读说明" }] },
      }}
    />,
  )
  expect(ready).toContain('href="/handouts/reading-guide"')
  expect(ready).toContain("阅读说明")
})
