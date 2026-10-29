import { parseLocalDate } from "@mykaoyan/core"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { emptyStudyDocument, studyDocument } from "../study-fixture"
import { WeeklyView } from "./weekly-page"

const noop = async () => true

describe("周复盘页", () => {
  it("从周一开始汇总各科计划与实际分钟，并统计本周变化", () => {
    const html = renderToStaticMarkup(
      <WeeklyView
        status="ready"
        document={studyDocument}
        message=""
        weekStart={parseLocalDate("2030-03-04")}
        onChangeWeek={noop}
        onSave={noop}
      />
    )
    expect(html).toContain("2030-03-04 至 2030-03-10")
    expect(html).toContain("700")
    expect(html).toContain("500")
    expect(html).toContain("1355")
    expect(html).toContain("210")
    expect(html).toContain("新稳定错题")
    expect(html).toContain("新稳定考点")
  })

  it("回填本周已有的下周调整", () => {
    const html = renderToStaticMarkup(
      <WeeklyView
        status="ready"
        document={studyDocument}
        message=""
        weekStart={parseLocalDate("2030-03-04")}
        onChangeWeek={noop}
        onSave={noop}
      />
    )
    expect(html).toContain("虚构调整")
    expect(html).toContain("保存下周调整")
  })

  it("没有备考档案时提示先建立档案", () => {
    const html = renderToStaticMarkup(
      <WeeklyView
        status="ready"
        document={emptyStudyDocument}
        message=""
        weekStart={parseLocalDate("2030-03-04")}
        onChangeWeek={noop}
        onSave={noop}
      />
    )
    expect(html).toContain("还没有备考档案")
    expect(html).toContain("/plan")
  })
})
