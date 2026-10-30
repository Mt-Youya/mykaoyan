import { upsertUniqueBy } from "../collections"
import type { LocalDate } from "../dates/index"
import { getStableOn, isMistakeStable } from "../mistakes/index"
import type { Mistake, TopicManualState, TopicProgress } from "../progress/index"
import type { Topic } from "./data"

export { publicTopics, topicSchema } from "./data"
export type { Topic } from "./data"

/** 考点进度：未测、学习中、已练，以及由关联错题推算的待重测、稳定。 */
export type TopicState = "untested" | "learning" | "practiced" | "retest" | "stable"

export type TopicProgressItem = { topic: Topic; state: TopicState }

/** 某考点的关联错题。 */
function relatedMistakes(topicId: string, mistakes: readonly Mistake[]) {
  return mistakes.filter((mistake) => mistake.topicId === topicId)
}

/**
 * 考点进度推算（PLAN §5.8）：考生手动只能设到已练；已练且有未稳定错题为待重测，
 * 全部稳定为稳定；没有关联错题的已练考点保持已练。稳定不能手动设定。
 */
export function getTopicState(topicId: string, manual: TopicManualState, mistakes: readonly Mistake[]): TopicState {
  if (manual !== "practiced") return manual
  const related = relatedMistakes(topicId, mistakes)
  if (related.length === 0) return "practiced"
  return related.every(isMistakeStable) ? "stable" : "retest"
}

/** 考点稳定的日期：关联错题全部稳定时取最晚一次第二次独立完成的日期，否则 null。 */
export function getTopicStableOn(topicId: string, mistakes: readonly Mistake[]): LocalDate | null {
  const related = relatedMistakes(topicId, mistakes)
  if (related.length === 0) return null
  let latest: LocalDate | null = null
  for (const mistake of related) {
    const stableOn = getStableOn(mistake)
    if (stableOn === null) return null
    if (latest === null || stableOn > latest) latest = stableOn
  }
  return latest
}

/** 列出考点及其当前进度；手动记录缺省为未测。 */
export function getTopicProgressList(
  topics: readonly Topic[],
  progress: readonly TopicProgress[],
  mistakes: readonly Mistake[],
): TopicProgressItem[] {
  return topics.map((topic) => {
    const manual = progress.find((item) => item.topicId === topic.id)?.manual ?? "untested"
    return { topic, state: getTopicState(topic.id, manual, mistakes) }
  })
}

/** 考点进度记录按考点唯一：同一考点替换并归并重复项，否则追加；不改入参。 */
export function upsertTopicProgress(progress: readonly TopicProgress[], record: TopicProgress): TopicProgress[] {
  return upsertUniqueBy(progress, (item) => item.topicId, record)
}
