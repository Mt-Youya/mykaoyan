import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"

import { HomePage } from "./routes"

it("首页服务端直接输出已确认的阅读入口，不发布原型里的虚构课程", () => {
  const html = renderToStaticMarkup(<HomePage />)
  expect(html).toContain("把值得回看的")
  expect(html).toContain('href="/subjects/302"')
  expect(html).toContain('href="/subjects/408"')
  expect(html).toContain('href="/login"')
  expect(html).toContain('href="/today"')
  expect(html).not.toContain("Hello，服务已启动")
  expect(html).not.toContain("从变化率认识导数")
})
