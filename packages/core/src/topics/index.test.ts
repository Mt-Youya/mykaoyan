import { describe, expect, it } from "vitest"

import {
  getTopicProgressList,
  getTopicStableOn,
  getTopicState,
  publicTopics,
  topicSchema,
  upsertTopicProgress,
} from "."
import { parseLocalDate } from "../dates"
import { getRetestState } from "../mistakes"
import { mistakeSchema, progressFileSchema } from "../progress"
import type { Mistake } from "../progress"
import { fullProgressFileFixture } from "../progress/fixtures"

const file = progressFileSchema.parse(fullProgressFileFixture.value)
const base = file.data.mistakes[0]!

function unstable(topicId: string): Mistake {
  return mistakeSchema.parse({
    ...base,
    id: `unstable-${topicId}`,
    topicId,
    retests: [
      { on: "2030-03-03", result: "independent" },
      { on: "2030-03-08", result: "failed" },
    ],
  })
}

describe("公开考点表", () => {
  it("编号唯一，元数据只含编号、科目、名称与分组", () => {
    expect(new Set(publicTopics.map((topic) => topic.id)).size).toBe(publicTopics.length)
    for (const topic of publicTopics) expect(topicSchema.safeParse(topic).success).toBe(true)
    expect(publicTopics.some((topic) => topic.subject === "302")).toBe(true)
    expect(publicTopics.every((topic) => topic.subject === "302" || topic.subject === "408")).toBe(true)
    expect(publicTopics.filter((topic) => topic.subject === "408").every((topic) => Boolean(topic.part))).toBe(true)
  })

  it("不含真题原文或答案字段", () => {
    for (const topic of publicTopics)
      expect(Object.keys(topic).toSorted()).toEqual(expect.arrayContaining(["id", "subject", "title"]))
  })
})

describe("考点进度推算", () => {
  it("手动状态只有未测、学习中和已练", () => {
    expect(getTopicState("M01", "untested", [])).toBe("untested")
    expect(getTopicState("M01", "learning", [])).toBe("learning")
    expect(getTopicState("M01", "practiced", [])).toBe("practiced")
  })

  it("已练且有未稳定错题为待重测", () => {
    expect(getTopicState("M03", "practiced", [unstable("M03")])).toBe("retest")
    expect(getTopicState("M03", "practiced", [base, unstable("M03")])).toBe("retest")
  })

  it("关联错题全部稳定为稳定", () => {
    const [mistake] = file.data.mistakes
    expect(getTopicState("M03", "practiced", [mistake!])).toBe("stable")
    expect(getRetestState(mistake!, parseLocalDate("2030-03-10"))).toEqual({ stable: true })
  })

  it("没有关联错题的已练考点保持已练", () => {
    expect(getTopicState("M03", "practiced", [])).toBe("practiced")
  })
})

describe("考点稳定日期", () => {
  it("取关联错题里最晚的第二次独立完成日期", () => {
    const [mistake] = file.data.mistakes
    const later = mistakeSchema.parse({
      ...mistake!,
      id: "later",
      retests: [
        { on: "2030-03-05", result: "independent" },
        { on: "2030-03-12", result: "independent" },
      ],
    })
    expect(getTopicStableOn("M03", [mistake!])).toBe("2030-03-08")
    expect(getTopicStableOn("M03", [mistake!, later])).toBe("2030-03-12")
  })

  it("有未稳定错题或没有关联错题时返回 null", () => {
    const [mistake] = file.data.mistakes
    expect(getTopicStableOn("M03", [mistake!, unstable("M03")])).toBeNull()
    expect(getTopicStableOn("M03", [])).toBeNull()
  })
})

describe("考点进度列表", () => {
  it("按考点表顺序列出，手动记录缺省为未测", () => {
    const topics = [
      publicTopics.find((topic) => topic.id === "M01")!,
      publicTopics.find((topic) => topic.id === "M03")!,
      publicTopics.find((topic) => topic.id === "D02")!,
    ]
    const list = getTopicProgressList(
      topics,
      [
        { topicId: "M03", manual: "practiced", updatedAt: "2030-03-01T00:00:00.000Z" },
        { topicId: "D02", manual: "learning", updatedAt: "2030-03-02T00:00:00.000Z" },
        { topicId: "F99", manual: "practiced", updatedAt: "2030-03-02T00:00:00.000Z" },
      ],
      file.data.mistakes,
    )
    expect(list.map((item) => [item.topic.id, item.state])).toEqual([
      ["M01", "untested"],
      ["M03", "stable"],
      ["D02", "learning"],
    ])
  })

  it("考点进度记录按考点唯一：同一考点替换，新考点追加且不改入参", () => {
    const original = [{ topicId: "M03", manual: "practiced" as const, updatedAt: "2030-03-01T00:00:00.000Z" }]
    const replaced = upsertTopicProgress(original, {
      topicId: "M03",
      manual: "learning",
      updatedAt: "2030-03-02T00:00:00.000Z",
    })
    expect(replaced).toEqual([{ topicId: "M03", manual: "learning", updatedAt: "2030-03-02T00:00:00.000Z" }])
    expect(original[0]!.manual).toBe("practiced")
    expect(
      upsertTopicProgress(original, { topicId: "D02", manual: "untested", updatedAt: "2030-03-02T00:00:00.000Z" }),
    ).toHaveLength(2)
  })
})
