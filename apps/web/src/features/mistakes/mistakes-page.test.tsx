import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { z } from "zod"

import { mistakeSchema, parseLocalDate } from "@mykaoyan/core"

import { MistakeItem } from "./mistakes-page"

const base = {
  id: "mistake-1",
  subject: "302",
  source: "练习册 3-2",
  questionMd: "求极限",
  correctionMd: "先通分再约分",
  causes: ["calculation"],
  correctedOn: "2030-03-01",
  retests: [],
  createdAt: "2030-03-01T12:00:00.000Z",
}

type MistakeInput = z.input<typeof mistakeSchema>

function render(today: string, overrides: Partial<MistakeInput> = {}) {
  const mistake = mistakeSchema.parse({ ...base, ...overrides })
  return renderToStaticMarkup(<MistakeItem mistake={mistake} today={parseLocalDate(today)} onRetest={() => {}} />)
}

describe("错题条目", () => {
  it("逾期时显示逾期天数和三个复测按钮", () => {
    const html = render("2030-03-06")
    expect(html).toContain("第 1 次复测")
    expect(html).toContain("逾期 3 天")
    expect(html).toContain("独立完成")
    expect(html).toContain("提示后完成")
    expect(html).toContain("不会")
  })

  it("未到期时只显示计划日期，不给复测按钮", () => {
    const html = render("2030-03-01")
    expect(html).toContain("计划 2030-03-03")
    expect(html).not.toContain("逾期")
    expect(html).not.toContain("独立完成")
  })

  it("两次独立完成后显示已稳定，不再显示复测按钮", () => {
    const html = render("2030-03-10", {
      retests: [
        { on: "2030-03-03", result: "independent" },
        { on: "2030-03-08", result: "independent" },
      ],
    })
    expect(html).toContain("已稳定：两次复测均独立完成。")
    expect(html).not.toContain("逾期")
    expect(html).not.toContain("提示后完成")
    expect(html).not.toContain("<button")
  })

  it("第一次独立完成后进入第 2 次复测", () => {
    const html = render("2030-03-10", { retests: [{ on: "2030-03-03", result: "independent" }] })
    expect(html).toContain("第 2 次复测")
    expect(html).toContain("逾期 2 天")
    expect(html).toContain("独立完成")
  })
})
