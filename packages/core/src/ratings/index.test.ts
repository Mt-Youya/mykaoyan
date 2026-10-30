import { describe, expect, it } from "vitest"

import { ratingInputSchema, ratingSummary } from "."
describe("评分与推荐", () => {
  it("按固定先验权重计算贝叶斯平均，不把少数高分当推荐", () => {
    expect(ratingSummary(1, 5, 3)).toEqual({ ratingCount: 1, weightedScore: 35 / 11, recommended: false })
    expect(ratingSummary(5, 25, 3).weightedScore).toBe(55 / 15)
    expect(ratingSummary(5, 25, 3).recommended).toBe(false)
    expect(ratingSummary(0, 0, 0)).toEqual({ ratingCount: 0, weightedScore: 0, recommended: false })
    expect(ratingSummary(0, 0, 4).weightedScore).toBe(4)
  })
  it("至少5人且未舍入得分至少4.0才推荐", () => {
    expect(ratingSummary(5, 20, 4)).toEqual({ ratingCount: 5, weightedScore: 4, recommended: true })
    expect(ratingSummary(4, 20, 4).recommended).toBe(false)
    expect(ratingSummary(5, 20, 3.9999).recommended).toBe(false)
  })
  it("只接受1到5整数星数，不接受伪造身份或推荐状态", () => {
    expect(ratingInputSchema.safeParse({ stars: 5 }).success).toBe(true)
    for (const body of [
      { stars: 0 },
      { stars: 6 },
      { stars: 1.5 },
      { stars: "5" },
      { stars: 5, accountId: "forged" },
      { stars: 5, recommended: true },
    ])
      expect(ratingInputSchema.safeParse(body).success).toBe(false)
  })
})
