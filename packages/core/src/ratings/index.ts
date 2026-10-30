import { z } from "zod"
export const RATING_PRIOR_COUNT = 10
export const RECOMMEND_RATING_COUNT = 5
export const RECOMMEND_WEIGHTED_SCORE = 4
export const ratingInputSchema = z.strictObject({ stars: z.number().int().min(1).max(5) })
export type RatingSummary = { ratingCount: number; weightedScore: number; recommended: boolean }
/** 全站暂无评分时globalMean为0；推荐判断不舍入。 */
export function ratingSummary(count: number, sum: number, globalMean: number): RatingSummary {
  const weightedScore = (RATING_PRIOR_COUNT * globalMean + sum) / (RATING_PRIOR_COUNT + count)
  return {
    ratingCount: count,
    weightedScore,
    recommended: count >= RECOMMEND_RATING_COUNT && weightedScore >= RECOMMEND_WEIGHTED_SCORE,
  }
}
