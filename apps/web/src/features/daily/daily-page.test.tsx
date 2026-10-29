import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { emptyStudyDocument, studyDocument } from "../study-fixture"
import { DailyView } from "./daily-page"

const noop = async () => true

describe("每日记录页", () => {
  it("当天已有记录时进入编辑，并显示当天计划总分钟", () => {
    const html = renderToStaticMarkup(
      <DailyView status="ready" document={studyDocument} message="" today="2030-03-10" onSave={noop} />
    )
    expect(html).toContain("修改已有记录")
    expect(html).toContain("保存这一天")
    expect(html).toContain("205 分钟")
    expect(html).toContain("2030-03-10")
  })

  it("当天没有记录时显示新增，最近的记录列出日期", () => {
    const html = renderToStaticMarkup(
      <DailyView status="ready" document={studyDocument} message="" today="2030-03-11" onSave={noop} />
    )
    expect(html).toContain("记录这一天")
    expect(html).toContain("最近的记录")
    expect(html).toContain("2030-03-10")
  })

  it("没有备考档案时提示先建立档案", () => {
    const html = renderToStaticMarkup(
      <DailyView status="ready" document={emptyStudyDocument} message="" today="2030-03-10" onSave={noop} />
    )
    expect(html).toContain("先建立档案")
    expect(html).toContain("/plan")
    expect(html).not.toContain("记录这一天")
  })
})
