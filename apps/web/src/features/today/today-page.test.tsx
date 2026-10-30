import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { mistakeSchema, parseLocalDate } from "@mykaoyan/core"

import { emptyStudyDocument, studyDocument } from "../study-fixture"
import { TodayView } from "./today-page"

const today = parseLocalDate("2030-03-10")

function overdueMistake(id: string, correctedOn: string) {
  return mistakeSchema.parse({
    id,
    subject: "302",
    source: "虚构练习册",
    questionMd: "虚构题目",
    correctionMd: "虚构订正",
    causes: ["concept"],
    correctedOn,
    retests: [],
    createdAt: "2030-03-01T00:00:00.000Z",
  })
}

describe("今日页", () => {
  it("按逾期复测、今天复测、到期卡、新卡的顺序排列", () => {
    const html = renderToStaticMarkup(
      <TodayView
        status="ready"
        document={{
          ...studyDocument,
          data: {
            ...studyDocument.data,
            mistakes: [overdueMistake("overdue", "2030-03-01"), overdueMistake("due-today", "2030-03-08")],
          },
        }}
        message=""
        today={today}
        vocab={{ due: 2, newAvailable: 1 }}
      />,
    )
    expect(html.indexOf("<strong>逾期 7 天的复测</strong>")).toBeGreaterThan(-1)
    expect(html.indexOf("<strong>逾期 7 天的复测</strong>")).toBeLessThan(html.indexOf("<strong>今天的复测</strong>"))
    expect(html.indexOf("<strong>今天的复测</strong>")).toBeLessThan(html.indexOf("<strong>到期单词卡 2 张</strong>"))
    expect(html.indexOf("<strong>到期单词卡 2 张</strong>")).toBeLessThan(
      html.indexOf("<strong>可引入新卡 1 张</strong>"),
    )
  })

  it("显示当天计划、已记录时长和备考档案入口", () => {
    const html = renderToStaticMarkup(
      <TodayView status="ready" document={studyDocument} message="" today={today} vocab={null} />,
    )
    expect(html).toContain("205 分钟")
    expect(html).toContain("302 数学（二）")
    expect(html).toContain("120")
    expect(html).toContain("/daily")
  })

  it("没有备考档案时提示先建立档案，仍显示复测", () => {
    const html = renderToStaticMarkup(
      <TodayView
        status="ready"
        document={{
          ...emptyStudyDocument,
          data: { ...emptyStudyDocument.data, mistakes: [overdueMistake("overdue", "2030-03-01")] },
        }}
        message=""
        today={today}
        vocab={null}
      />,
    )
    expect(html).toContain("还没有备考档案")
    expect(html).toContain("去建立备考档案")
    expect(html).toContain("逾期 7 天的复测")
  })
})
