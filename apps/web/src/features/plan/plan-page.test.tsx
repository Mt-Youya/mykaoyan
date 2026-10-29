import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { emptyStudyDocument, studyDocument } from "../study-fixture"
import { PlanView } from "./plan-page"

const noop = () => {}

describe("备考档案与计划页", () => {
  it("没有档案时提示先建立，并给出创建表单", () => {
    const html = renderToStaticMarkup(
      <PlanView status="ready" document={emptyStudyDocument} message="" onSaveProfile={noop} onSaveDayPlan={noop} />
    )
    expect(html).toContain("还没有备考档案")
    expect(html).toContain("备考档案")
    expect(html).toContain("保存备考档案")
    expect(html).not.toContain("登录后")
  })

  it("已有档案时回填科目、阶段与按天覆盖", () => {
    const html = renderToStaticMarkup(
      <PlanView status="ready" document={studyDocument} message="" onSaveProfile={noop} onSaveDayPlan={noop} />
    )
    expect(html).toContain("数学（二）")
    expect(html).toContain("基础阶段")
    expect(html).toContain("按天覆盖")
    expect(html).toContain("保存这一天的计划")
  })

  it("未登录时只给登录入口", () => {
    const html = renderToStaticMarkup(
      <PlanView status="unauthorized" document={null} message="" onSaveProfile={noop} onSaveDayPlan={noop} />
    )
    expect(html).toContain("登录账号")
    expect(html).toContain('href="/login"')
    expect(html).not.toContain("保存备考档案")
  })
})
