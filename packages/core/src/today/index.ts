import type { LocalDate } from "../dates/index"
import { getDueRetests } from "../mistakes/index"
import type { DueRetest } from "../mistakes/index"
import type { Mistake } from "../progress/index"

/** 单词卡数量；浏览器本地没有词表时按 0 处理。 */
export type VocabCounts = { due: number; newAvailable: number }

/** 今日页的一条待办，按出现顺序排列。 */
export type TodayTask =
  | { kind: "overdue-retest"; due: DueRetest }
  | { kind: "today-retest"; due: DueRetest }
  | { kind: "due-cards"; count: number }
  | { kind: "new-cards"; count: number }

/**
 * 今日页排序（PLAN §5.8）：逾期复测（逾期最久在前）→ 今天的复测 → 到期卡数量 → 新卡数量。
 * 数量为 0 的条目不出现在待办里；不替考生挑选考点。
 */
export function getTodayTasks(mistakes: readonly Mistake[], vocab: VocabCounts | null, today: LocalDate): TodayTask[] {
  const due = getDueRetests(mistakes, today)
  const tasks: TodayTask[] = [
    ...due
      .filter((item) => item.state.overdueDays > 0)
      .map((item): TodayTask => ({ kind: "overdue-retest", due: item })),
    ...due
      .filter((item) => item.state.overdueDays === 0)
      .map((item): TodayTask => ({ kind: "today-retest", due: item })),
  ]
  if (vocab?.due) tasks.push({ kind: "due-cards", count: vocab.due })
  if (vocab?.newAvailable) tasks.push({ kind: "new-cards", count: vocab.newAvailable })
  return tasks
}
