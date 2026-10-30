import { describe, expect, it } from "vitest"
import { z } from "zod"

import { localDateSchema } from "../dates"
import { fullProgressFileFixture, invalidProgressFixtures, validProgressFixtures } from "./fixtures"
import { PROGRESS_FILE_APP, PROGRESS_FILE_VERSION, progressFileSchema } from "."

type JsonObject = Record<string, unknown>

function withValue(source: unknown, path: readonly string[], value: unknown): unknown {
  const clone = JSON.parse(JSON.stringify(source)) as JsonObject
  let cursor = clone
  for (const key of path.slice(0, -1)) cursor = cursor[key] as JsonObject
  const last = path[path.length - 1]
  if (last === undefined) throw new Error("path 不能为空")
  cursor[last] = value
  return clone
}

const fixtureAt = (path: readonly string[], value: unknown) => withValue(fullProgressFileFixture.value, path, value)

describe("进度文件 v1 fixture", () => {
  it.each(validProgressFixtures.map((fixture) => [fixture.name, fixture.value] as const))(
    "接受有效 fixture %s",
    (_name, value) => {
      const result = progressFileSchema.safeParse(value)
      expect(result.success, result.error?.message).toBe(true)
    },
  )

  it.each(invalidProgressFixtures.map((fixture) => [fixture.name, fixture.value] as const))(
    "拒绝无效 fixture %s",
    (_name, value) => {
      expect(progressFileSchema.safeParse(value).success).toBe(false)
    },
  )
})

describe("进度文件 v1 识别字段", () => {
  it("app 固定为 mykaoyan", () => {
    expect(PROGRESS_FILE_APP).toBe("mykaoyan")
    expect(progressFileSchema.safeParse(fixtureAt(["app"], "mykaoyan")).success).toBe(true)
    expect(progressFileSchema.safeParse(fixtureAt(["app"], "kaoyan")).success).toBe(false)
    expect(progressFileSchema.safeParse(fixtureAt(["app"], "")).success).toBe(false)
  })

  it("version 固定为 1", () => {
    expect(PROGRESS_FILE_VERSION).toBe(1)
    expect(progressFileSchema.safeParse(fixtureAt(["version"], 1)).success).toBe(true)
    expect(progressFileSchema.safeParse(fixtureAt(["version"], 2)).success).toBe(false)
    expect(progressFileSchema.safeParse(fixtureAt(["version"], "1")).success).toBe(false)
  })
})

describe("进度文件 v1 日期与时间字段", () => {
  const localDatePaths: readonly (readonly string[])[] = [
    ["data", "profile", "examDate"],
    ["data", "mistakes", "0", "correctedOn"],
    ["data", "mistakes", "0", "retests", "0", "on"],
    ["data", "daily", "0", "date"],
    ["data", "dayPlans", "0", "date"],
    ["data", "weekly", "0", "weekStart"],
  ]
  const localDateCandidates = [
    "2024-02-29",
    "2030-12-31",
    "2025-02-29",
    "2030-04-31",
    "2030-1-01",
    "2030-03-10T00:00:00Z",
    "",
  ]

  it.each(localDatePaths.map((path) => [path.join("."), path] as const))(
    "日期字段 %s 与 core 的 LocalDate 结论一致",
    (_label, path) => {
      for (const value of localDateCandidates) {
        const actual = progressFileSchema.safeParse(fixtureAt(path, value)).success
        const expected = localDateSchema.safeParse(value).success
        expect(actual, `${path.join(".")}=${JSON.stringify(value)}`).toBe(expected)
      }
    },
  )

  // 阶段开始/结束还受「结束不早于开始、阶段不重叠」约束，合法日期也可能整体被拒绝；
  // 这里只断言非法日期仍会被拒绝，顺序约束由「备考档案阶段校验」单独覆盖。
  it("阶段开始与结束日期仍按 LocalDate 校验", () => {
    for (const path of [
      ["data", "profile", "phases", "0", "start"],
      ["data", "profile", "phases", "0", "end"],
    ] as const) {
      for (const value of ["2025-02-29", "2030-04-31", "2030-1-01", "2030-03-10T00:00:00Z", ""]) {
        expect(progressFileSchema.safeParse(fixtureAt(path, value)).success, `${path.join(".")}=${value}`).toBe(false)
      }
    }
  })

  const dateTimePaths: readonly (readonly string[])[] = [
    ["updatedAt"],
    ["data", "progress", "0", "updatedAt"],
    ["data", "mistakes", "0", "createdAt"],
  ]
  const dateTimeCandidates: readonly (readonly [string, boolean])[] = [
    ["2030-03-10T21:30:00+08:00", true],
    ["2030-03-10T13:30:00.000Z", true],
    ["2030-03-10", false],
    ["2030-03-10T21:30:00", false],
    ["2030-03-10 21:30:00+08:00", false],
    ["2030-03-10T21:30:00+0800", false],
    ["", false],
  ]

  it.each(dateTimePaths.map((path) => [path.join("."), path] as const))(
    "时间字段 %s 必须是带时区的 ISO 时间",
    (_label, path) => {
      for (const [value, expected] of dateTimeCandidates) {
        expect(progressFileSchema.safeParse(fixtureAt(path, value)).success, `${path.join(".")}=${value}`).toBe(
          expected,
        )
      }
    },
  )
})

describe("进度文件 v1 文本字段", () => {
  it("编号与名称不接受空串或纯空白", () => {
    for (const path of [
      ["data", "progress", "0", "topicId"],
      ["data", "profile", "phases", "0", "name"],
      ["data", "mistakes", "0", "id"],
    ] as const) {
      expect(progressFileSchema.safeParse(fixtureAt(path, "")).success, path.join(".")).toBe(false)
      expect(progressFileSchema.safeParse(fixtureAt(path, "   ")).success, path.join(".")).toBe(false)
    }
  })

  it("自由文本允许空串", () => {
    expect(progressFileSchema.safeParse(fixtureAt(["data", "daily", "0", "retro"], "")).success).toBe(true)
    expect(progressFileSchema.safeParse(fixtureAt(["data", "weekly", "0", "nextWeekAdjustment"], "")).success).toBe(
      true,
    )
  })
})

describe("进度文件 v1 公开契约产物", () => {
  it("可以生成 JSON Schema 2020-12，供契约生成脚本使用", () => {
    const schema = z.toJSONSchema(progressFileSchema, { io: "input" })
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
    expect(schema.additionalProperties).toBe(false)
  })
})

describe("备考档案阶段校验", () => {
  const plan = { minutes: {}, flexMin: 0 }
  const phases = [
    { name: "阶段一", start: "2030-03-01", end: "2030-06-30", weekday: plan, weekend: plan },
    { name: "阶段二", start: "2030-06-30", end: "2030-08-01", weekday: plan, weekend: plan },
  ]

  it("重叠或未按日期先后排列的阶段被 schema 拒绝", () => {
    const result = progressFileSchema.safeParse(fixtureAt(["data", "profile", "phases"], phases))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes("重叠"))).toBe(true)
  })

  it("首尾相接的阶段可以上传", () => {
    const adjacent = [phases[0]!, { ...phases[1]!, start: "2030-07-01", end: "2030-08-01" }]
    expect(progressFileSchema.safeParse(fixtureAt(["data", "profile", "phases"], adjacent)).success).toBe(true)
  })
})
