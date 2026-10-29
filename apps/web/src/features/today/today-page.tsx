import {
  getDayPlan,
  getPlanTotal,
  getRecordedMinutes,
  getTodayTasks,
  getVocabCounts,
  toLocalDate,
} from "@mykaoyan/core"
import type { LocalDate, ProgressFile, VocabCounts } from "@mykaoyan/core"
import { useProgress } from "../progress"
import { useVocab } from "../vocab"

export type TodayViewProps = {
  status: "loading" | "ready" | "unauthorized" | "error"
  document: ProgressFile | null
  message: string
  today: LocalDate
  vocab: VocabCounts | null
}

function Gate({ status, message }: { status: TodayViewProps["status"]; message: string }) {
  if (status === "loading") return <p role="status">正在汇总今日待办…</p>
  if (status === "unauthorized")
    return (
      <p>
        登录后查看云端学习待办。
        <a className="underline underline-offset-4" href="/login">
          去登录
        </a>
      </p>
    )
  return (
    <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
      {message || "学习数据暂不可用，请稍后重试。"}
    </p>
  )
}

/** 今日页：按「逾期复测 → 今天的复测 → 到期卡 → 新卡」排列，并显示当天计划与已记录时长。 */
export function TodayView({ status, document, message, today, vocab }: TodayViewProps) {
  if (status !== "ready" || !document) {
    return (
      <main className="page-container py-section">
        <div className="mx-auto max-w-[52rem]">
          <header className="border-b border-border pb-8">
            <p className="text-sm tracking-[0.08em] text-muted-foreground">我的学习</p>
            <h1 className="mt-4 font-serif text-hero">今日页</h1>
          </header>
          <div className="mt-6">
            <Gate status={status} message={message} />
          </div>
        </div>
      </main>
    )
  }

  const profile = document.data.profile
  const tasks = getTodayTasks(document.data.mistakes, vocab, today)
  const plan = getDayPlan(profile, document.data.dayPlans, today)
  const recorded = getRecordedMinutes(document.data.daily, today)
  const subjects = profile?.subjects ?? []

  return (
    <main className="page-container py-section">
      <div className="mx-auto grid max-w-[52rem] gap-10">
        <header className="border-b border-border pb-8">
          <p className="text-sm tracking-[0.08em] text-muted-foreground">我的学习</p>
          <h1 className="mt-4 font-serif text-hero">今日页</h1>
          <p className="mt-5 max-w-[65ch] text-muted-foreground">
            先处理逾期复测，再做今天的复测；单词卡只显示这个浏览器里的私有统计。今日页不替你挑选考点。
          </p>
        </header>

        <section aria-labelledby="today-plan-title" className="grid gap-4 border-b border-border pb-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="today-plan-title" className="text-section">
              今天的计划
            </h2>
            <a className="underline underline-offset-4" href="/plan">
              调整计划
            </a>
          </div>
          {profile ? (
            plan ? (
              <div className="grid gap-3">
                <p className="text-muted-foreground">
                  {getPlanTotal(plan)} 分钟（含弹性 {plan.flexMin} 分钟）
                  {profile.otherMin ? `，另有不归入科目的固定 ${profile.otherMin} 分钟` : ""}
                </p>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">科目</th>
                      <th className="py-2 pr-4 font-medium">计划分钟</th>
                      <th className="py-2 font-medium">已记录</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((subject) => (
                      <tr key={subject.code} className="border-b border-border">
                        <td className="py-2 pr-4">
                          {subject.code} {subject.name}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">{plan.minutes[subject.code] ?? 0}</td>
                        <td className="py-2 tabular-nums">{recorded[subject.code] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground">今天不在任何阶段内，没有默认计划分钟；可以按天覆盖。</p>
            )
          ) : (
            <p className="border border-dashed border-border p-4">
              还没有备考档案，暂时没有计划分钟。
              <a className="ml-2 underline underline-offset-4" href="/plan">
                去建立备考档案
              </a>
            </p>
          )}
          <a className="justify-self-start underline underline-offset-4" href="/daily">
            记录今天的学习
          </a>
        </section>

        <section aria-labelledby="today-tasks-title">
          <h2 id="today-tasks-title" className="text-section">
            按顺序完成
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            到期卡与可引入新卡数量来自这个浏览器里的词表；本地没有词表时为 0。
          </p>
          {tasks.length === 0 ? (
            <p className="mt-5 text-muted-foreground">今天没有待处理的复测或单词卡。</p>
          ) : (
            <ol className="mt-5 divide-y divide-border border-y border-border">
              {tasks.map((task) => {
                if (task.kind === "overdue-retest" || task.kind === "today-retest") {
                  const { mistake, state } = task.due
                  return (
                    <li key={`retest-${mistake.id}`} className="py-4">
                      <strong>
                        {task.kind === "overdue-retest" ? `逾期 ${state.overdueDays} 天的复测` : "今天的复测"}
                      </strong>
                      <p className="mt-1 text-muted-foreground">
                        {mistake.subject} · {mistake.source || "未标注来源"} · 第 {state.attempt} 次
                      </p>
                      <a className="mt-2 inline-block underline underline-offset-4" href="/mistakes">
                        去复测
                      </a>
                    </li>
                  )
                }
                if (task.kind === "due-cards") {
                  return (
                    <li key="due-cards" className="py-4">
                      <strong>到期单词卡 {task.count} 张</strong>
                      <p className="mt-1 text-muted-foreground">先清空到期卡，再开始新卡。</p>
                      <a className="mt-2 inline-block underline underline-offset-4" href="/vocabulary">
                        去背单词
                      </a>
                    </li>
                  )
                }
                return (
                  <li key="new-cards" className="py-4">
                    <strong>可引入新卡 {task.count} 张</strong>
                    <p className="mt-1 text-muted-foreground">每天最多 30 张新卡。</p>
                    <a className="mt-2 inline-block underline underline-offset-4" href="/vocabulary">
                      去背单词
                    </a>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </main>
  )
}

export function TodayPage() {
  const { status, document, message } = useProgress()
  const { data: vocab } = useVocab()
  const today = toLocalDate(new Date())
  const counts = vocab ? getVocabCounts(vocab, today) : null
  return <TodayView status={status} document={document} message={message} today={today} vocab={counts} />
}
