import {
  dailyLogSchema,
  getDailyLog,
  getDayPlan,
  getPlanTotal,
  localDateSchema,
  parseLocalDate,
  toLocalDate,
} from "@mykaoyan/core"
import type { DailyLog, ProgressFile } from "@mykaoyan/core"
import { Button, Input, Label } from "@mykaoyan/ui"
import type { FormEvent } from "react"
import { useState } from "react"
import { useProgress } from "../progress"

const buttonSize = "min-h-11 px-5 text-base"

export type DailyViewProps = {
  status: "loading" | "ready" | "unauthorized" | "error"
  document: ProgressFile | null
  message: string
  today: string
  onSave: (log: DailyLog) => void
}

function numberOrZero(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

function Gate({ status, message }: { status: DailyViewProps["status"]; message: string }) {
  if (status === "loading") return <p role="status">正在读取云端学习数据…</p>
  if (status === "unauthorized")
    return (
      <p>
        每日记录会同步到账号。请先{" "}
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

function DailyEditor({
  date,
  codes,
  initial,
  onSave,
}: {
  date: string
  codes: string[]
  initial: DailyLog | null
  onSave: (log: DailyLog) => void
}) {
  const [minutes, setMinutes] = useState<Record<string, string>>(() =>
    Object.fromEntries(codes.map((code) => [code, String(initial?.minutes[code] ?? 0)]))
  )
  const [done, setDone] = useState(initial?.done ?? "")
  const [tomorrowTop, setTomorrowTop] = useState(initial?.tomorrowTop ?? "")
  const [retro, setRetro] = useState(initial?.retro ?? "")
  const [error, setError] = useState("")

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    try {
      onSave(
        dailyLogSchema.parse({
          date,
          minutes: Object.fromEntries(codes.map((code) => [code, numberOrZero(minutes[code] ?? "0")])),
          done,
          tomorrowTop,
          retro,
        })
      )
    } catch {
      setError("每日记录没有保存：请检查日期与各科分钟。")
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-2 reading:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
        {codes.map((code) => (
          <Label key={code} className="flex-col items-stretch gap-1">
            {code} 学习分钟
            <Input
              type="number"
              min={0}
              value={minutes[code] ?? "0"}
              onChange={(event) => setMinutes((current) => ({ ...current, [code]: event.target.value }))}
            />
          </Label>
        ))}
      </div>
      <Label className="flex-col items-stretch gap-2">
        完成事项
        <textarea
          className="min-h-24 border border-input bg-note-paper p-3"
          value={done}
          onChange={(event) => setDone(event.target.value)}
        />
      </Label>
      <Label className="flex-col items-stretch gap-2">
        明日首要任务
        <textarea
          className="min-h-20 border border-input bg-note-paper p-3"
          value={tomorrowTop}
          onChange={(event) => setTomorrowTop(event.target.value)}
        />
      </Label>
      <Label className="flex-col items-stretch gap-2">
        一句复盘
        <Input value={retro} onChange={(event) => setRetro(event.target.value)} />
      </Label>
      {error && (
        <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
          {error}
        </p>
      )}
      <Button className={`${buttonSize} justify-self-start`} type="submit">
        {initial ? "保存这一天" : "记录这一天"}
      </Button>
    </form>
  )
}

/** 每日记录：每天最多一条，可以补录或修改过去日期；学习时长只记在每日记录里。 */
export function DailyView({ status, document, message, today, onSave }: DailyViewProps) {
  const [date, setDate] = useState(today)
  const [notice, setNotice] = useState("")

  if (status !== "ready" || !document) {
    return (
      <main className="page-container py-section">
        <div className="mx-auto max-w-[52rem]">
          <h1 className="font-serif text-hero">每日记录</h1>
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
          <h1 className="font-serif text-hero">每日记录</h1>
          <p className="border border-dashed border-border p-6">
            还没有备考档案。先建立档案，才能按考试科目记录学习时长。
          </p>
          <a className="underline underline-offset-4" href="/plan">
            去建立备考档案
          </a>
        </div>
      </main>
    )
  }

  const codes = profile.subjects.map((subject) => subject.code)
  const selected = localDateSchema.safeParse(date).success ? parseLocalDate(date) : null
  const existing = selected ? getDailyLog(document.data.daily, selected) : null
  const plan = selected ? getDayPlan(profile, document.data.dayPlans, selected) : null
  const recent = document.data.daily.toSorted((left, right) => right.date.localeCompare(left.date)).slice(0, 14)

  return (
    <main className="page-container py-section">
      <div className="mx-auto grid max-w-[52rem] gap-10">
        <header className="border-b border-border pb-8">
          <p className="text-sm tracking-[0.08em] text-muted-foreground">我的学习 · 云端私有数据</p>
          <h1 className="mt-4 font-serif text-hero">每日记录</h1>
          <p className="mt-5 max-w-[65ch] text-muted-foreground">
            每天最多一条记录，可以补录或修改过去日期。学习时长只来自这里，今日页会读取同一天的记录。
          </p>
        </header>

        <section className="grid gap-4" aria-labelledby="daily-editor-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="daily-editor-title" className="text-section">
              {existing ? "修改已有记录" : "记录这一天"}
            </h2>
            <Label className="flex items-center gap-2 text-base font-normal">
              日期
              <Input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />
            </Label>
          </div>
          <p className="text-sm text-muted-foreground">
            {plan
              ? `当天计划 ${getPlanTotal(plan)} 分钟${existing ? " · 这一天已有记录，保存会覆盖" : ""}`
              : "这一天不在任何阶段内，没有默认计划分钟。"}
          </p>
          <DailyEditor
            key={date}
            date={date}
            codes={codes}
            initial={existing}
            onSave={(log) => {
              onSave(log)
              setNotice(`已保存 ${log.date} 的每日记录。`)
            }}
          />
        </section>

        <section aria-labelledby="daily-list-title">
          <h2 id="daily-list-title" className="text-section">
            最近的记录
          </h2>
          {recent.length === 0 ? (
            <p className="mt-5 text-muted-foreground">还没有每日记录。</p>
          ) : (
            <ul className="mt-5 divide-y divide-border border-y border-border">
              {recent.map((log) => (
                <li
                  key={log.date}
                  className="grid gap-2 py-4 reading:grid-cols-[8rem_minmax(0,1fr)_auto] reading:items-start"
                >
                  <button
                    type="button"
                    className="justify-self-start text-left underline underline-offset-4"
                    onClick={() => setDate(log.date)}
                  >
                    {log.date}
                  </button>
                  <span className="text-muted-foreground">
                    {Object.entries(log.minutes)
                      .map(([code, minutes]) => `${code} ${minutes} 分钟`)
                      .join(" · ") || "未填学习时长"}
                  </span>
                  <span className="text-muted-foreground">{log.done || "未填完成事项"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {(notice || message) && (
          <p role={notice ? "status" : "alert"} className="text-muted-foreground">
            {notice || message}
          </p>
        )}
      </div>
    </main>
  )
}

export function DailyPage() {
  const { status, document, message, save } = useProgress()

  async function saveLog(log: DailyLog) {
    if (!document) return
    const exists = document.data.daily.some((item) => item.date === log.date)
    const daily = exists
      ? document.data.daily.map((item) => (item.date === log.date ? log : item))
      : [...document.data.daily, log]
    await save({ ...document, data: { ...document.data, daily } })
  }

  return (
    <DailyView
      key={document?.revision ?? 0}
      status={status}
      document={document}
      message={message}
      today={toLocalDate(new Date())}
      onSave={(log) => void saveLog(log)}
    />
  )
}
