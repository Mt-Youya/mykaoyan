import {
  addDays,
  getWeekDays,
  getWeeklyReview,
  getWeeklySummary,
  parseLocalDate,
  publicTopics,
  startOfWeek,
  toLocalDate,
  upsertWeeklyReview,
} from "@mykaoyan/core"
import type { LocalDate, ProgressFile, WeeklyReview } from "@mykaoyan/core"
import { Button } from "@mykaoyan/ui"
import type { FormEvent } from "react"
import { useState } from "react"
import { useProgress } from "../progress"

const buttonSize = "min-h-10 px-4 text-sm"

export type WeeklyViewProps = {
  status: "loading" | "ready" | "unauthorized" | "error"
  document: ProgressFile | null
  message: string
  weekStart: LocalDate
  onChangeWeek: (weekStart: LocalDate) => void
  onSave: (review: WeeklyReview) => Promise<boolean>
}

function Gate({ status, message }: { status: WeeklyViewProps["status"]; message: string }) {
  if (status === "loading") return <p role="status">正在读取云端学习数据…</p>
  if (status === "unauthorized")
    return (
      <p>
        周复盘会同步到账号。请先{" "}
        <a className="underline underline-offset-4" href="/login">
          登录账号
        </a>
        。
      </p>
    )
  return (
    <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
      {message || "学习数据暂不可用，请稍后重试。"}
    </p>
  )
}

function AdjustmentForm({
  weekStart,
  initial,
  onSave,
}: {
  weekStart: LocalDate
  initial: WeeklyReview | null
  onSave: (review: WeeklyReview) => Promise<boolean>
}) {
  const [text, setText] = useState(initial?.nextWeekAdjustment ?? "")
  const [error, setError] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    try {
      if (!(await onSave({ weekStart, nextWeekAdjustment: text })))
        setError("下周调整没有保存。云端数据可能已更新，请刷新后重试。")
    } catch {
      setError("下周调整没有保存。")
    }
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <label className="grid gap-2">
        <span className="text-base">下周调整</span>
        <textarea
          className="min-h-24 border border-input bg-note-paper p-3"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="只写一段下周要调整的安排"
        />
      </label>
      {error && (
        <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
          {error}
        </p>
      )}
      <Button className={`${buttonSize} justify-self-start`} type="submit">
        保存下周调整
      </Button>
    </form>
  )
}

/** 周复盘：从周一开始的只读汇总，加上考生自己写的一段下周调整。 */
export function WeeklyView({ status, document, message, weekStart, onChangeWeek, onSave }: WeeklyViewProps) {
  if (status !== "ready" || !document) {
    return (
      <main className="page-container py-section">
        <div className="mx-auto max-w-[52rem]">
          <h1 className="font-serif text-hero">周复盘</h1>
          <div className="mt-6">
            <Gate status={status} message={message} />
          </div>
        </div>
      </main>
    )
  }

  const profile = document.data.profile
  if (!profile) {
    return (
      <main className="page-container py-section">
        <div className="mx-auto grid max-w-[52rem] gap-6">
          <h1 className="font-serif text-hero">周复盘</h1>
          <p className="border border-dashed border-border p-6">还没有备考档案。建立档案后，周复盘才能对比计划分钟。</p>
          <a className="underline underline-offset-4" href="/plan">
            去建立备考档案
          </a>
        </div>
      </main>
    )
  }

  const days = getWeekDays(weekStart)
  const summary = getWeeklySummary({
    profile,
    dayPlans: document.data.dayPlans,
    daily: document.data.daily,
    mistakes: document.data.mistakes,
    topics: publicTopics,
    progress: document.data.progress,
    weekStart,
  })
  const review = getWeeklyReview(document.data.weekly, weekStart)
  const nextWeek = addDays(weekStart, 7)

  return (
    <main className="page-container py-section">
      <div className="mx-auto grid max-w-[52rem] gap-10">
        <header className="border-b border-border pb-8">
          <p className="text-sm tracking-[0.08em] text-muted-foreground">我的学习 · 云端私有数据</p>
          <h1 className="mt-4 font-serif text-hero">周复盘</h1>
          <p className="mt-5 max-w-[65ch] text-muted-foreground">
            一周从周一开始，只读汇总本周的学习时长、错题与考点变化；下面只保存你写的一段下周调整。
          </p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium">
            {days[0]} 至 {days[6]}
          </p>
          <div className="flex gap-2">
            <Button className={buttonSize} variant="outline" onClick={() => onChangeWeek(addDays(weekStart, -7))}>
              上一周
            </Button>
            <Button className={buttonSize} variant="outline" onClick={() => onChangeWeek(nextWeek)}>
              下一周
            </Button>
            <Button
              className={buttonSize}
              variant="outline"
              onClick={() => onChangeWeek(startOfWeek(toLocalDate(new Date())))}
            >
              本周
            </Button>
          </div>
        </div>

        <section aria-labelledby="weekly-time-title" className="grid gap-4 border-y border-border py-8">
          <h2 id="weekly-time-title" className="text-section">
            学习时长对计划
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">科目</th>
                <th className="py-2 pr-4 font-medium">计划分钟</th>
                <th className="py-2 font-medium">已记录分钟</th>
              </tr>
            </thead>
            <tbody>
              {summary.subjects.map((subject) => (
                <tr key={subject.code} className="border-b border-border">
                  <td className="py-2 pr-4">
                    {subject.code} {subject.name}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{subject.plannedMinutes}</td>
                  <td className="py-2 tabular-nums">{subject.actualMinutes}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-4 font-medium">合计</td>
                <td className="py-2 pr-4 tabular-nums">{summary.plannedMinutes}</td>
                <td className="py-2 tabular-nums">{summary.actualMinutes}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section aria-labelledby="weekly-change-title" className="grid gap-3">
          <h2 id="weekly-change-title" className="text-section">
            本周变化
          </h2>
          <dl className="grid gap-3">
            {[
              ["新增错题", summary.newMistakes],
              ["新稳定错题", summary.newlyStableMistakes],
              ["新稳定考点", summary.newlyStableTopics],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between border-b border-border py-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="weekly-adjustment-title">
          <h2 id="weekly-adjustment-title" className="text-section">
            下周调整
          </h2>
          <div className="mt-4">
            <AdjustmentForm key={weekStart} weekStart={weekStart} initial={review} onSave={onSave} />
          </div>
        </section>

        {message && (
          <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
            {message}
          </p>
        )}
      </div>
    </main>
  )
}

export function WeeklyPage() {
  const { status, document, message, save } = useProgress()
  const [weekStart, setWeekStart] = useState<LocalDate>(() => startOfWeek(toLocalDate(new Date())))

  async function saveReview(review: WeeklyReview) {
    if (!document) return false
    return save({ ...document, data: { ...document.data, weekly: upsertWeeklyReview(document.data.weekly, review) } })
  }

  return (
    <WeeklyView
      key={`${document?.revision ?? 0}-${weekStart}`}
      status={status}
      document={document}
      message={message}
      weekStart={weekStart}
      onChangeWeek={(next) => setWeekStart(parseLocalDate(next))}
      onSave={saveReview}
    />
  )
}
