import { Badge } from "@mykaoyan/ui"
import type { RatingSummary } from "@mykaoyan/core"
export function RatingStats({ value }: { value: RatingSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-muted-foreground">{`${value.ratingCount}人评分 · 加权平均分 ${value.weightedScore.toFixed(2)} / 5`}</p>
      {value.recommended ? <Badge variant="secondary">推荐</Badge> : null}
    </div>
  )
}
