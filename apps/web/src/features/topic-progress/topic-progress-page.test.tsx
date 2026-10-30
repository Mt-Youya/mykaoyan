import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { emptyStudyDocument, studyDocument } from "../study-fixture"
import { TopicProgressView } from "./topic-progress-page"

const noop = () => {}

describe("考点进度页", () => {
  it("按所考科目列出考点，显示推算出的稳定与学习中", () => {
    const html = renderToStaticMarkup(
      <TopicProgressView status="ready" document={studyDocument} message="" onSetManual={noop} />,
    )
    expect(html).toContain("302 · 数学（二）")
    expect(html).toContain("408 · 计算机学科专业基础")
    expect(html).toContain("一元函数积分学")
    expect(html).toContain("稳定（关联错题都已稳定）")
    expect(html).toContain("学习中")
    expect(html).toContain("待重测")
  })

  it("只提供未测、学习中、已练三个手动按钮，稳定不能手动设定", () => {
    const html = renderToStaticMarkup(
      <TopicProgressView status="ready" document={studyDocument} message="" onSetManual={noop} />,
    )
    expect(html).toContain("未测")
    expect(html).toContain("已练")
    expect(html).not.toContain(">稳定<")
  })

  it("没有备考档案时提示先建立档案", () => {
    const html = renderToStaticMarkup(
      <TopicProgressView status="ready" document={emptyStudyDocument} message="" onSetManual={noop} />,
    )
    expect(html).toContain("还没有备考档案")
    expect(html).toContain("/plan")
  })
})
