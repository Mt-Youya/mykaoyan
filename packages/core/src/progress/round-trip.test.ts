import { describe, expect, it } from "vitest"
import { fullProgressFileFixture } from "./fixtures/index"
import { progressFileSchema } from "./schema"

describe("学习数据随进度文件往返", () => {
  it("备考档案、按天计划、每日记录、周复盘与考点进度序列化后再解析逐字段相等", () => {
    const file = progressFileSchema.parse(fullProgressFileFixture.value)
    const roundTripped = progressFileSchema.parse(JSON.parse(JSON.stringify(file)))
    expect(roundTripped).toEqual(file)
    expect(roundTripped.data.profile).toEqual(file.data.profile)
    expect(roundTripped.data.dayPlans).toEqual(file.data.dayPlans)
    expect(roundTripped.data.daily).toEqual(file.data.daily)
    expect(roundTripped.data.weekly).toEqual(file.data.weekly)
    expect(roundTripped.data.progress).toEqual(file.data.progress)
  })
})
