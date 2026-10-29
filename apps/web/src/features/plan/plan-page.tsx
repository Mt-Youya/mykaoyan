import {
  dayPlanSchema,
  getDayPlan,
  getPlanTotal,
  localDateSchema,
  parseLocalDate,
  studyProfileSchema,
  toLocalDate,
  upsertDayPlan,
  validatePhases,
} from "@mykaoyan/core"
import type { DayPlan, ProgressFile, StudyProfile } from "@mykaoyan/core"
import { Button, Input, Label } from "@mykaoyan/ui"
import type { FormEvent } from "react"
import { useEffect, useState } from "react"
import { useProgress } from "../progress"

const buttonSize = "min-h-11 px-5 text-base"

type SubjectRow = { code: string; name: string; targetScore: string }
type PhaseRow = {
  name: string
  start: string
  end: string
  weekday: Record<string, string>
  weekend: Record<string, string>
  flexWeekday: string
  flexWeekend: string
}

export type PlanViewProps = {
  status: "loading" | "ready" | "unauthorized" | "error"
  document: ProgressFile | null
  message: string
  onSaveProfile: (profile: StudyProfile) => Promise<boolean>
  onSaveDayPlan: (plan: DayPlan) => Promise<boolean>
}

function Gate({ status, message }: { status: PlanViewProps["status"]; message: string }) {
  if (status === "loading") return <p role="status">正在读取云端学习数据…</p>
  if (status === "unauthorized")
    return (
      <p>
        备考档案与计划会同步到账号。请先{" "}
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

function subjectRows(profile: StudyProfile | null): SubjectRow[] {
  if (!profile || profile.subjects.length === 0) {
    return [{ code: "302", name: "数学（二）", targetScore: "110" }]
  }
  return profile.subjects.map((subject) => ({
    code: subject.code,
    name: subject.name,
    targetScore: String(subject.targetScore),
  }))
}

function minuteRow(code: string, minutes: Record<string, number> | undefined, fallback = "") {
  return minutes?.[code] === undefined ? fallback : String(minutes[code])
}

function phaseRows(profile: StudyProfile | null, subjects: SubjectRow[]): PhaseRow[] {
  const codes = subjects.map((subject) => subject.code)
  if (!profile || profile.phases.length === 0) {
    const minutes = Object.fromEntries(codes.map((code) => [code, "0"]))
    return [
      {
        name: "基础阶段",
        start: "",
        end: "",
        weekday: { ...minutes },
        weekend: { ...minutes },
        flexWeekday: "0",
        flexWeekend: "0",
      },
    ]
  }
  return profile.phases.map((phase) => ({
    name: phase.name,
    start: phase.start,
    end: phase.end,
    weekday: Object.fromEntries(codes.map((code) => [code, minuteRow(code, phase.weekday.minutes)])),
    weekend: Object.fromEntries(codes.map((code) => [code, minuteRow(code, phase.weekend.minutes)])),
    flexWeekday: String(phase.weekday.flexMin),
    flexWeekend: String(phase.weekend.flexMin),
  }))
}

function numberOrZero(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

/** 备考档案与按天计划：保存后整体替换档案，按天覆盖写入单独的计划记录。 */
export function PlanView({ status, document, message, onSaveProfile, onSaveDayPlan }: PlanViewProps) {
  const profile = document?.data.profile ?? null
  const [examDate, setExamDate] = useState(profile?.examDate ?? "")
  const [otherMin, setOtherMin] = useState(String(profile?.otherMin ?? 0))
  const [subjects, setSubjects] = useState<SubjectRow[]>(() => subjectRows(profile))
  const [phases, setPhases] = useState<PhaseRow[]>(() => phaseRows(profile, subjectRows(profile)))
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const [overrideDate, setOverrideDate] = useState<string>(toLocalDate(new Date()))
  const [overrideMinutes, setOverrideMinutes] = useState<Record<string, string>>({})
  const [overrideFlex, setOverrideFlex] = useState("0")

  // 档案从云端到达或被外部更新时同步表单；不重置已保存提示，避免刚保存的反馈被清掉。
  useEffect(() => {
    if (!document) return
    const next = document.data.profile
    const nextSubjects = subjectRows(next)
    setExamDate(next?.examDate ?? "")
    setOtherMin(String(next?.otherMin ?? 0))
    setSubjects(nextSubjects)
    setPhases(phaseRows(next, nextSubjects))
  }, [document])

  // 按天覆盖：切换日期或数据变化时，用已有覆盖回填，避免把旧值当成 0 保存。
  useEffect(() => {
    if (!document) return
    const parsed = localDateSchema.safeParse(overrideDate)
    const plan = parsed.success ? document.data.dayPlans.find((item) => item.date === parsed.data) : undefined
    const overrideCodes = subjects.map((subject) => subject.code.trim()).filter(Boolean)
    setOverrideMinutes(Object.fromEntries(overrideCodes.map((code) => [code, String(plan?.minutes[code] ?? 0)])))
    setOverrideFlex(String(plan?.flexMin ?? 0))
  }, [document, overrideDate, subjects])

  if (status !== "ready" || !document) {
    return (
      <main className="page-container py-section">
        <div className="mx-auto max-w-[52rem]">
          <h1 className="font-serif text-hero">备考档案与计划</h1>
          <div className="mt-6">
            <Gate status={status} message={message} />
          </div>
        </div>
      </main>
    )
  }

  const codes = subjects.map((subject) => subject.code.trim()).filter(Boolean)

  function updateSubject(index: number, patch: Partial<SubjectRow>) {
    setSubjects((rows) => rows.map((row, position) => (position === index ? { ...row, ...patch } : row)))
  }

  function updatePhase(index: number, patch: Partial<PhaseRow>) {
    setPhases((rows) => rows.map((row, position) => (position === index ? { ...row, ...patch } : row)))
  }

  function updatePhaseMinutes(index: number, slot: "weekday" | "weekend", code: string, value: string) {
    setPhases((rows) =>
      rows.map((row, position) => (position === index ? { ...row, [slot]: { ...row[slot], [code]: value } } : row))
    )
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setSaved("")
    try {
      const nextSubjects = subjects.map((subject) => ({
        code: subject.code.trim(),
        name: subject.name.trim(),
        targetScore: numberOrZero(subject.targetScore),
      }))
      const nextPhases = phases.map((phase) => {
        const minutes = (slot: Record<string, string>) =>
          Object.fromEntries(nextSubjects.map((subject) => [subject.code, numberOrZero(slot[subject.code] ?? "0")]))
        return {
          name: phase.name.trim(),
          start: phase.start,
          end: phase.end,
          weekday: { minutes: minutes(phase.weekday), flexMin: numberOrZero(phase.flexWeekday) },
          weekend: { minutes: minutes(phase.weekend), flexMin: numberOrZero(phase.flexWeekend) },
        }
      })
      const next = studyProfileSchema.parse({
        examDate,
        subjects: nextSubjects,
        otherMin: numberOrZero(otherMin),
        phases: nextPhases,
      })
      const invalid = validatePhases(next.phases)
      if (invalid) return setError(invalid)
      if (!(await onSaveProfile(next))) return setError("备考档案没有保存。云端数据可能已更新，请刷新后重试。")
      setSaved("已保存备考档案。")
    } catch {
      setError("备考档案没有保存：请检查初试日期、科目代码（三位数字）、目标分与阶段日期。")
    }
  }

  async function saveDayPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setSaved("")
    try {
      const parsed = dayPlanSchema.parse({
        date: parseLocalDate(overrideDate),
        minutes: Object.fromEntries(codes.map((code) => [code, numberOrZero(overrideMinutes[code] ?? "0")])),
        flexMin: numberOrZero(overrideFlex),
      })
      if (!(await onSaveDayPlan(parsed))) return setError("按天计划没有保存。云端数据可能已更新，请刷新后重试。")
      setSaved(`已保存 ${parsed.date} 的按天计划。`)
    } catch {
      setError("按天计划没有保存：请选择合法日期，分钟必须是非负整数。")
    }
  }

  const previewDate = parseLocalDate(overrideDate || toLocalDate(new Date()))
  const preview = getDayPlan(profile, document.data.dayPlans, previewDate)

  return (
    <main className="page-container py-section">
      <div className="mx-auto grid max-w-[52rem] gap-12">
        <header className="border-b border-border pb-8">
          <p className="text-sm tracking-[0.08em] text-muted-foreground">我的学习 · 云端私有数据</p>
          <h1 className="mt-4 font-serif text-hero">备考档案与计划</h1>
          <p className="mt-5 max-w-[65ch] text-muted-foreground">
            初试日期、考试科目与阶段分钟决定每天的默认计划；某一天可以单独覆盖。未在任何阶段内的日期不安排分钟。
          </p>
        </header>

        {!profile && (
          <p className="border border-dashed border-border p-6">
            还没有备考档案。先填下面的档案，今日页才能给出计划分钟。
          </p>
        )}

        <form className="grid gap-6 border-y border-border py-8" onSubmit={saveProfile}>
          <h2 className="text-section">备考档案</h2>
          <div className="grid gap-4 reading:grid-cols-2">
            <Label className="flex-col items-stretch gap-2">
              初试日期
              <Input type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} required />
            </Label>
            <Label className="flex-col items-stretch gap-2">
              每天固定分钟（不归入考试科目）
              <Input type="number" min={0} value={otherMin} onChange={(event) => setOtherMin(event.target.value)} />
            </Label>
          </div>

          <fieldset className="grid gap-3">
            <legend className="mb-2 text-base">考试科目与目标分</legend>
            {subjects.map((subject, index) => (
              <div key={index} className="grid gap-2 reading:grid-cols-[5rem_minmax(0,1fr)_6rem_auto]">
                <Input
                  value={subject.code}
                  aria-label={`第 ${index + 1} 个科目代码`}
                  inputMode="numeric"
                  pattern="[0-9]{3}"
                  onChange={(event) => updateSubject(index, { code: event.target.value })}
                  required
                />
                <Input
                  value={subject.name}
                  aria-label={`第 ${index + 1} 个科目名称`}
                  onChange={(event) => updateSubject(index, { name: event.target.value })}
                  required
                />
                <Input
                  type="number"
                  min={0}
                  aria-label={`第 ${index + 1} 个科目目标分`}
                  value={subject.targetScore}
                  onChange={(event) => updateSubject(index, { targetScore: event.target.value })}
                />
                <Button
                  type="button"
                  variant="outline"
                  className={buttonSize}
                  onClick={() => setSubjects((rows) => rows.filter((_, position) => position !== index))}
                >
                  删除
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className={`${buttonSize} justify-self-start`}
              onClick={() => setSubjects((rows) => [...rows, { code: "", name: "", targetScore: "0" }])}
            >
              添加科目
            </Button>
          </fieldset>

          <fieldset className="grid gap-4">
            <legend className="mb-2 text-base">阶段与各科分钟</legend>
            {phases.map((phase, index) => (
              <div key={index} className="grid gap-3 border border-border p-4">
                <div className="grid gap-2 reading:grid-cols-[minmax(0,1fr)_10rem_10rem]">
                  <Input
                    value={phase.name}
                    aria-label={`第 ${index + 1} 个阶段名称`}
                    onChange={(event) => updatePhase(index, { name: event.target.value })}
                    required
                  />
                  <Input
                    type="date"
                    value={phase.start}
                    aria-label={`第 ${index + 1} 个阶段开始日期`}
                    onChange={(event) => updatePhase(index, { start: event.target.value })}
                    required
                  />
                  <Input
                    type="date"
                    value={phase.end}
                    aria-label={`第 ${index + 1} 个阶段结束日期`}
                    onChange={(event) => updatePhase(index, { end: event.target.value })}
                    required
                  />
                </div>
                {(
                  [
                    ["weekday", "工作日分钟", phase.flexWeekday, phase.weekday],
                    ["weekend", "周末分钟", phase.flexWeekend, phase.weekend],
                  ] as const
                ).map(([slot, title, flexValue, minutes]) => (
                  <div key={slot}>
                    <p className="mb-2 text-sm text-muted-foreground">{title}</p>
                    <div className="grid gap-2 reading:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
                      {codes.map((code) => (
                        <Label key={code} className="flex-col items-stretch gap-1">
                          {code} 分钟
                          <Input
                            type="number"
                            min={0}
                            value={minutes[code] ?? "0"}
                            onChange={(event) => updatePhaseMinutes(index, slot, code, event.target.value)}
                          />
                        </Label>
                      ))}
                      <Label className="flex-col items-stretch gap-1">
                        弹性时间
                        <Input
                          type="number"
                          min={0}
                          value={flexValue}
                          onChange={(event) =>
                            updatePhase(
                              index,
                              slot === "weekday"
                                ? { flexWeekday: event.target.value }
                                : { flexWeekend: event.target.value }
                            )
                          }
                        />
                      </Label>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className={`${buttonSize} justify-self-start`}
                  onClick={() => setPhases((rows) => rows.filter((_, position) => position !== index))}
                >
                  删除阶段
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className={`${buttonSize} justify-self-start`}
              onClick={() => setPhases((rows) => [...rows, phaseRows(null, subjects)[0]!])}
            >
              添加阶段
            </Button>
          </fieldset>

          <Button className={`${buttonSize} justify-self-start`} type="submit">
            保存备考档案
          </Button>
        </form>

        <form className="grid gap-4" onSubmit={saveDayPlan}>
          <h2 className="text-section">按天覆盖</h2>
          <p className="text-muted-foreground">
            当天计划优先于阶段分配；不填的科目按 0 分钟记录。预览：
            {preview ? `${getPlanTotal(preview)} 分钟` : profile ? "这一天不在任何阶段内" : "没有备考档案"}
          </p>
          <Label className="flex-col items-stretch gap-2">
            日期
            <Input
              type="date"
              value={overrideDate}
              onChange={(event) => setOverrideDate(event.target.value)}
              required
            />
          </Label>
          <div className="grid gap-2 reading:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
            {codes.map((code) => (
              <Label key={code} className="flex-col items-stretch gap-1">
                {code} 分钟
                <Input
                  type="number"
                  min={0}
                  value={overrideMinutes[code] ?? "0"}
                  onChange={(event) => setOverrideMinutes((current) => ({ ...current, [code]: event.target.value }))}
                />
              </Label>
            ))}
            <Label className="flex-col items-stretch gap-1">
              弹性时间
              <Input
                type="number"
                min={0}
                value={overrideFlex}
                onChange={(event) => setOverrideFlex(event.target.value)}
              />
            </Label>
          </div>
          <Button className={`${buttonSize} justify-self-start`} type="submit">
            保存这一天的计划
          </Button>
        </form>

        {(error || message) && (
          <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
            {error || message}
          </p>
        )}
        {saved && (
          <p role="status" className="text-muted-foreground">
            {saved}
          </p>
        )}
      </div>
    </main>
  )
}

export function PlanPage() {
  const { status, document, message, save } = useProgress()

  async function saveProfile(profile: StudyProfile) {
    if (!document) return false
    return save({ ...document, data: { ...document.data, profile } })
  }

  async function saveDayPlan(plan: DayPlan) {
    if (!document) return false
    return save({ ...document, data: { ...document.data, dayPlans: upsertDayPlan(document.data.dayPlans, plan) } })
  }

  return (
    <PlanView
      status={status}
      document={document}
      message={message}
      onSaveProfile={saveProfile}
      onSaveDayPlan={saveDayPlan}
    />
  )
}
