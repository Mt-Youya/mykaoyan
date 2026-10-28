import { useEffect, useRef, useState } from "react"
import { Button, Input, Label } from "@mykaoyan/ui"
import { createDraft, presets, standardSubjects } from "../../features/profile"
import type { ExamSubject, StudyDraft } from "../../features/profile"
import { TargetLookup } from "./target-lookup"
import type { CatalogSelection } from "./target-lookup"

const steps = ["报考目标", "考试组合", "当前学习范围"]
const fields = [
  ["school", "学校"],
  ["college", "学院"],
  ["major", "招生专业（代码与名称）"],
  ["direction", "研究方向"],
  ["mode", "学习方式"],
] as const

const kicker = "text-sm tracking-[0.08em] text-muted-foreground"
const caption = "mt-6 max-w-[65ch] text-sm text-muted-foreground"
const fieldsGrid = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] gap-6"
const fieldLabel = "flex-col items-stretch gap-2 text-base leading-relaxed font-normal"
const fieldInput = "min-h-12 bg-note-paper px-3 py-2 text-base md:text-base"
const choiceOption =
  "min-h-[4.5rem] gap-4 border border-border px-6 py-4 font-normal leading-relaxed active:opacity-75 hover:bg-paper-soft has-[:checked]:border-primary has-[:checked]:bg-book-blue hover:has-[:checked]:bg-book-blue"
const checkRow = "min-h-11 gap-3 text-base leading-relaxed font-normal hover:text-primary active:opacity-75"
const nativeControl =
  "size-[1.125rem] shrink-0 accent-primary outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
const buttonSize = "min-h-12 px-6 text-base"
const actions = "flex flex-wrap gap-3"
const legendText = "mb-4 font-semibold"
const textLink =
  "underline underline-offset-4 hover:decoration-2 active:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

function nextYear() {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric" }).format(new Date())) + 1
}
function choiceFor(subjects: ExamSubject[]) {
  return (
    Object.entries(presets).find(
      ([, items]) => items.map((s) => s.code).join() === subjects.map((s) => s.code).join()
    )?.[0] ?? "custom"
  )
}
export function ProfileForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: StudyDraft | null
  onSave: (draft: StudyDraft) => boolean
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(() => initial ?? createDraft(nextYear()))
  const [step, setStep] = useState(0)
  const [choice, setChoice] = useState(() => (initial ? choiceFor(initial.subjects) : ""))
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    title.current?.focus()
  }, [])
  function go(next: number) {
    setStep(next)
    setError("")
    requestAnimationFrame(() => title.current?.focus())
  }
  function subjects(items: ExamSubject[]) {
    if (items.length > 8) return setError("最多选择八门科目。")
    setDraft((old) => ({
      ...old,
      subjects: items,
      source: null,
      active: items.filter((s) => old.active.includes(s.code)).map((s) => s.code),
    }))
  }
  function addCustom() {
    if (!/^\d{3}$/.test(code) || !name.trim()) return setError("请填写三位科目代码和正式名称。")
    if (draft.subjects.some((s) => s.code === code) || standardSubjects.some((s) => s.code === code))
      return setError("该代码已存在，请使用上方的科目选项。")
    if (draft.subjects.length >= 8) return setError("最多选择八门科目。")
    subjects([...draft.subjects, { code, name: name.trim() }])
    setCode("")
    setName("")
    setError("")
  }
  function applyCatalog({ target, subjects: items, source }: CatalogSelection) {
    setDraft((old) => ({
      ...old,
      target,
      source,
      subjects: items,
      active: items.filter((s) => old.active.includes(s.code)).map((s) => s.code),
    }))
    setChoice(choiceFor(items))
    setError("")
  }
  const checked = draft.source
    ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium" }).format(
        new Date(draft.source.checkedAt)
      )
    : ""
  const added = draft.subjects.filter(
    (s) => !initial?.subjects.some((old) => old.code === s.code && old.name === s.name)
  )
  const removed =
    initial?.subjects.filter((s) => !draft.subjects.some((next) => next.code === s.code && next.name === s.name)) ?? []
  return (
    <section id="my-study" className="page-container py-section">
      <form
        className="mx-auto w-full max-w-[52rem] [&>*+*]:mt-6"
        onSubmit={(event) => {
          event.preventDefault()
          if (step === 1) {
            if (!draft.subjects.length) return setError("请至少选择一门考试科目。")
            if (
              draft.subjects.some((s) => !standardSubjects.some((item) => item.code === s.code)) &&
              !draft.target.school.trim()
            )
              return setError("自命题科目需要学校信息，请返回第一步填写学校。")
          }
          if (step === 2) {
            if (!draft.active.length) return setError("请至少选择一门当前学习科目。")
            onSave(draft)
          } else go(step + 1)
        }}
      >
        <p className={kicker}>我的备考 · 本机草稿</p>
        <ol
          className="flex flex-wrap gap-4 text-sm text-muted-foreground reading:gap-6 reading:text-base"
          aria-label="设置步骤"
        >
          {steps.map((label, index) => (
            <li
              key={label}
              aria-current={index === step ? "step" : undefined}
              className="aria-[current=step]:text-foreground aria-[current=step]:underline aria-[current=step]:underline-offset-[0.5em]"
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>
        <h1 ref={title} tabIndex={-1} className="text-[clamp(2rem,3vw,3rem)]">
          {steps[step]}
        </h1>
        <p className="max-w-[65ch] text-muted-foreground">先确定自己的范围，再把注意力留给手边的一科。</p>
        {step === 0 && (
          <>
            <Label className={fieldLabel}>
              招生年度
              <Input
                type="number"
                required
                min="2000"
                max="2100"
                value={draft.year}
                onChange={(e) => setDraft({ ...draft, year: Number(e.target.value) })}
                className={fieldInput}
              />
            </Label>
            <p className={caption}>指入学的招生年度。初试日期以后单独确认，这里不自动推算。</p>
            <TargetLookup year={draft.year} onApply={applyCatalog} />
            <fieldset className="min-w-0">
              <legend className={legendText}>报考目标（均可暂不填写）</legend>
              <div className={fieldsGrid}>
                {fields.map(([key, label]) => (
                  <Label key={key} className={fieldLabel}>
                    {label}
                    <Input
                      maxLength={120}
                      value={draft.target[key]}
                      onChange={(e) =>
                        // 手动改动目标后，科目不再能说是这个招生条目带出的。
                        setDraft({ ...draft, source: null, target: { ...draft.target, [key]: e.target.value } })
                      }
                      className={fieldInput}
                    />
                  </Label>
                ))}
              </div>
            </fieldset>
            <p className={caption}>
              还没定学校也可以开始。手动填写的学校与专业不会自动决定考试科目，请以对应年度的官方招生目录为准。
            </p>
          </>
        )}
        {step === 1 && (
          <>
            {draft.source && (
              <p className="max-w-[65ch] py-4 text-muted-foreground">
                已按研招网 {draft.year} 目录带出科目（{checked} 查询）。请对照
                {draft.source.url ? (
                  <a href={draft.source.url} target="_blank" rel="noreferrer noopener" className={textLink}>
                    条目详情
                  </a>
                ) : (
                  "招生简章"
                )}
                确认；手动调整科目也可以。
              </p>
            )}
            <fieldset className="grid min-w-0 gap-3">
              <legend className={legendText}>选择考试组合</legend>
              {(
                [
                  ["11408", "11408", "政治 · 英语一 · 数学一 · 408"],
                  ["22408", "22408", "政治 · 英语二 · 数学二 · 408"],
                  ["custom", "自行选择", "单科体验、其他统考或自命题组合"],
                ] as const
              ).map(([value, label, description]) => (
                <Label key={value} className={choiceOption}>
                  <input
                    type="radio"
                    name="combination"
                    checked={choice === value}
                    onChange={() => {
                      setChoice(value)
                      if (value !== "custom") subjects(presets[value])
                      setError("")
                    }}
                    className={nativeControl}
                  />
                  <span>
                    <strong className="block text-[1.15rem] font-semibold">{label}</strong>
                    <small className="block text-sm text-muted-foreground">{description}</small>
                  </span>
                </Label>
              ))}
            </fieldset>
            {choice === "custom" && (
              <>
                <fieldset className="grid min-w-0 gap-3">
                  <legend className={legendText}>选择统考科目</legend>
                  {standardSubjects.map((subject) => (
                    <Label key={subject.code} className={checkRow}>
                      <input
                        type="checkbox"
                        checked={draft.subjects.some((s) => s.code === subject.code)}
                        onChange={(e) =>
                          subjects(
                            e.target.checked
                              ? [...draft.subjects, subject]
                              : draft.subjects.filter((s) => s.code !== subject.code)
                          )
                        }
                        className={nativeControl}
                      />
                      {subject.code} {subject.name}
                    </Label>
                  ))}
                </fieldset>
                <fieldset className="min-w-0">
                  <legend className={legendText}>添加自命题科目</legend>
                  <div className={fieldsGrid}>
                    <Label className={fieldLabel}>
                      三位科目代码
                      <Input
                        inputMode="numeric"
                        maxLength={3}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className={fieldInput}
                      />
                    </Label>
                    <Label className={fieldLabel}>
                      正式科目名称
                      <Input
                        maxLength={120}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={fieldInput}
                      />
                    </Label>
                  </div>
                  <Button type="button" variant="outline" className={buttonSize} onClick={addCustom}>
                    添加科目
                  </Button>
                  <p className={caption}>自命题科目与本档案的学校、招生年度一起保存，不按代码混入公共目录。</p>
                  {draft.subjects
                    .filter((s) => !standardSubjects.some((item) => item.code === s.code))
                    .map((s) => (
                      <p key={s.code} className="text-muted-foreground">
                        {s.code} {s.name}{" "}
                        <Button
                          type="button"
                          variant="outline"
                          className={buttonSize}
                          onClick={() => subjects(draft.subjects.filter((item) => item.code !== s.code))}
                        >
                          移除 {s.code}
                        </Button>
                      </p>
                    ))}
                </fieldset>
              </>
            )}
            {!!draft.subjects.length && (
              <p className="max-w-[65ch] border-y border-border bg-paper-soft p-6 text-muted-foreground">
                完整考试科目：{draft.subjects.map((s) => `${s.code} ${s.name}`).join("、")}
              </p>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <fieldset className="grid min-w-0 gap-3">
              <legend className={legendText}>这阶段先学哪些？至少选一门</legend>
              {draft.subjects.map((s) => (
                <Label key={s.code} className={checkRow}>
                  <input
                    type="checkbox"
                    checked={draft.active.includes(s.code)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        active: e.target.checked
                          ? [...draft.active, s.code]
                          : draft.active.filter((activeCode) => activeCode !== s.code),
                      })
                    }
                    className={nativeControl}
                  />
                  {s.code} {s.name}
                </Label>
              ))}
            </fieldset>
            <Label className={checkRow}>
              <input
                type="checkbox"
                checked={draft.vocabulary}
                onChange={(e) => setDraft({ ...draft, vocabulary: e.target.checked })}
                className={nativeControl}
              />
              学习英语时显示背单词模块
            </Label>
            <div className="border-y border-border bg-paper-soft p-6 [&>p]:max-w-[65ch] [&>p+p]:mt-3">
              <h2 className="mb-4 text-[1.25rem]">保存前确认</h2>
              <p>
                {draft.year} 招生 · {draft.target.school || "目标院校待定"} · {draft.target.major || "专业待定"}
              </p>
              <p>完整考试科目：{draft.subjects.map((s) => s.name).join("、")}</p>
              <p>{draft.source ? `科目来源：研招网 ${draft.year} 招生目录，${checked} 查询` : "科目来源：自行选择"}</p>
              <p>
                当前学习：
                {draft.subjects
                  .filter((s) => draft.active.includes(s.code))
                  .map((s) => s.name)
                  .join("、") || "尚未选择"}
              </p>
              {initial && (
                <>
                  <p>
                    新增科目：{added.map((s) => s.name).join("、") || "无"}；移出组合：
                    {removed.map((s) => s.name).join("、") || "无"}。
                  </p>
                  <p>隐藏或移出科目只改变展示，不删除任何学习记录。</p>
                </>
              )}
            </div>
            <p className={caption}>
              仅保存在此浏览器，登录也不会自动同步。清除浏览器数据会丢失这份草稿，请勿在共享设备填写个人信息。
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="border border-border p-4 text-foreground">
            {error}
          </p>
        )}
        <div className={actions}>
          {step > 0 && (
            <Button type="button" variant="outline" className={buttonSize} onClick={() => go(step - 1)}>
              上一步
            </Button>
          )}
          <Button type="submit" className={buttonSize}>
            {step === 2 ? "保存并进入工作台" : "下一步"}
          </Button>
          <Button type="button" variant="outline" className={buttonSize} onClick={onCancel}>
            取消
          </Button>
        </div>
      </form>
    </section>
  )
}
