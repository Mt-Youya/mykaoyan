import { useEffect, useRef, useState } from "react"

import { PAPER_MAX_QUESTIONS, PAPER_SUBMISSION_MAX_BYTES } from "@mykaoyan/core"
import { Badge, Button, Input, Textarea } from "@mykaoyan/ui"

import { Breadcrumb } from "../catalog"
import { fetchMyPapers, submitUserPaper } from "./api"
import {
  emptyPaper,
  emptyQuestion,
  isChoiceQuestion,
  PAPER_QUESTION_TYPE_OPTIONS,
  parseImportedPaper,
  questionsBytes,
  validateDraft,
} from "./paper-form"
import type { PaperDraft, QuestionDraft } from "./paper-form"

const eyebrow = "text-[0.8125rem] tracking-[0.08em] text-muted-foreground"
const note = "text-[0.95rem] opacity-[0.75]"
const field = "grid gap-1.5 text-[0.95rem]"
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
const quietButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-6 text-[0.95rem] hover:bg-muted"
const subjects = [
  { code: "302", label: "数学（二）" },
  { code: "408", label: "408 计算机学科专业基础" },
]

type Gate = "checking" | "guest" | "ready"

function QuestionEditor(props: {
  index: number
  question: QuestionDraft
  removable: boolean
  onChange: (patch: Partial<QuestionDraft>) => void
  onRemove: () => void
}) {
  const { index, question } = props
  const choice = isChoiceQuestion(question.type)
  return (
    <li className="grid gap-4 rounded-xl border border-border bg-card px-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.2rem]">第 {index + 1} 题</h2>
        {props.removable ? (
          <Button type="button" variant="outline" className="min-h-11" onClick={props.onRemove}>
            删除本题
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 reading:grid-cols-4">
        <label className={field}>
          <span>题号</span>
          <Input
            type="number"
            min={1}
            max={999}
            value={question.number}
            onChange={(event) => props.onChange({ number: event.target.value })}
          />
        </label>
        <label className={field}>
          <span>题型</span>
          <select
            className={selectClass}
            value={question.type}
            onChange={(event) => {
              const type = event.target.value
              props.onChange({
                type,
                options: isChoiceQuestion(type) ? (question.options.length >= 2 ? question.options : ["", ""]) : [""],
              })
            }}
          >
            {PAPER_QUESTION_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          <span>分值（可留空）</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={question.score}
            onChange={(event) => props.onChange({ score: event.target.value })}
          />
        </label>
        <label className={field}>
          <span>考点（顿号分隔）</span>
          <Input value={question.topics} onChange={(event) => props.onChange({ topics: event.target.value })} />
        </label>
      </div>
      <label className={field}>
        <span>题面（Markdown）</span>
        <Textarea
          value={question.stemMarkdown}
          rows={4}
          onChange={(event) => props.onChange({ stemMarkdown: event.target.value })}
        />
      </label>
      {choice ? (
        <fieldset className="grid gap-2 border-0 p-0">
          <legend className="text-[0.95rem]">选项（2–8 个，按 A–H 顺序）</legend>
          {question.options.map((option, optionIndex) => (
            <div key={optionIndex} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-2">
              <span className="pt-2 font-medium">{"ABCDEFGH"[optionIndex]}.</span>
              <Textarea
                value={option}
                rows={2}
                onChange={(event) => {
                  const next = question.options.slice()
                  next[optionIndex] = event.target.value
                  props.onChange({ options: next })
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={question.options.length <= 2}
                onClick={() => props.onChange({ options: question.options.filter((_, i) => i !== optionIndex) })}
              >
                删除
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 justify-self-start"
            disabled={question.options.length >= 8}
            onClick={() => props.onChange({ options: [...question.options, ""] })}
          >
            添加选项
          </Button>
        </fieldset>
      ) : null}
      <label className={field}>
        <span>答案（Markdown，只在登录后的答案页显示）</span>
        <Textarea
          value={question.answerMarkdown}
          rows={3}
          onChange={(event) => props.onChange({ answerMarkdown: event.target.value })}
        />
      </label>
      <label className={field}>
        <span>解析（可留空）</span>
        <Textarea
          value={question.analysisMarkdown}
          rows={3}
          onChange={(event) => props.onChange({ analysisMarkdown: event.target.value })}
        />
      </label>
    </li>
  )
}

/**
 * 用户试卷提交页：登录即可（不要求会员）；提交后进入待审核，不可编辑或撤回。
 * 支持逐题填写与导入符合 `SubmitPaper` 的 JSON 文件，浏览器用同一份 core 契约校验。
 */
export function PaperSubmitPage() {
  const [gate, setGate] = useState<Gate>("checking")
  const [draft, setDraft] = useState<PaperDraft>(emptyPaper)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState<{ slug: string; questionCount: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void fetchMyPapers().then((state) => {
      if (active) setGate(state.status === "unauthorized" ? "guest" : "ready")
    })
    return () => {
      active = false
    }
  }, [])

  function update(patch: Partial<PaperDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, i) => (i === index ? { ...question, ...patch } : question)),
    }))
  }

  function addQuestion() {
    setDraft((current) =>
      current.questions.length >= PAPER_MAX_QUESTIONS
        ? current
        : { ...current, questions: [...current.questions, emptyQuestion(current.questions.length + 1)] },
    )
  }

  function removeQuestion(index: number) {
    setDraft((current) => ({ ...current, questions: current.questions.filter((_, i) => i !== index) }))
  }

  async function importJson(file: File) {
    const parsed = parseImportedPaper(await file.text())
    if (!parsed.ok) {
      setMessage(parsed.message)
      return
    }
    setDraft(parsed.draft)
    setMessage("已导入 JSON 内容；请核对题目并勾选权利声明后提交。")
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const validation = validateDraft(draft)
    if (!validation.ok) {
      setMessage(validation.message)
      return
    }
    setBusy(true)
    setMessage(null)
    const result = await submitUserPaper(validation.input)
    setBusy(false)
    if (result.status === "ok") {
      setSubmitted({ slug: result.data.slug, questionCount: result.data.questionCount })
      return
    }
    if (result.status === "unauthorized") {
      setGate("guest")
      setMessage("登录状态已失效，请重新登录后再提交。")
      return
    }
    setMessage(result.message)
  }

  if (submitted)
    return (
      <main className="page-container py-8 reading:py-16">
        <header className="grid gap-2">
          <Breadcrumb
            items={[
              { label: "我的考研", href: "/" },
              { label: "用户投稿试卷", href: "/community/papers" },
              { label: "提交试卷" },
            ]}
          />
          <h1 className="text-section leading-tight">已提交，等待审核</h1>
          <p className={note}>
            你的试卷（编号 {submitted.slug}，共 {submitted.questionCount} 题）已进入待审核状态。
          </p>
          <p className={note}>审核通过并由管理员上架后才会公开；提交后不可编辑或撤回。</p>
        </header>
        <div className="mt-8 flex flex-wrap gap-4">
          <a className={quietButton} href="/community/papers/mine">
            查看我的试卷
          </a>
          <a className={quietButton} href="/community/papers">
            返回用户投稿试卷
          </a>
        </div>
      </main>
    )

  if (gate === "checking") return <p className="page-container py-10 text-muted-foreground">正在检查登录状态…</p>
  if (gate === "guest")
    return (
      <main className="page-container py-10">
        <p className="text-muted-foreground">提交用户试卷需要先登录；上传只要求登录，不要求会员。</p>
        <a className={`${quietButton} mt-4`} href="/login">
          去登录
        </a>
      </main>
    )

  const bytes = questionsBytes(draft.questions)
  return (
    <main className="page-container py-8 reading:py-16">
      <header className="grid gap-2">
        <Breadcrumb
          items={[
            { label: "我的考研", href: "/" },
            { label: "用户投稿试卷", href: "/community/papers" },
            { label: "提交试卷" },
          ]}
        />
        <p className={eyebrow}>社区 · 用户投稿</p>
        <h1 className="text-section leading-tight">提交用户试卷</h1>
        <p className={note}>提交后进入待审核状态，题面公开前只有你与管理员可见；答案与解析只出现在登录后的答案页。</p>
        <p className={note}>
          整卷题面、选项、答案与解析合计 {bytes} / {PAPER_SUBMISSION_MAX_BYTES} 字节，最多 {PAPER_MAX_QUESTIONS} 题。
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => fileRef.current?.click()}>
          导入 JSON 文件
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void importJson(file)
            event.target.value = ""
          }}
        />
        <span className={note}>JSON 需符合 PublishPaper 结构（不含 slug/position），导入后可在页面继续修改。</span>
      </div>

      {message ? (
        <p className="my-4 text-[0.95rem]" role="alert">
          {message}
        </p>
      ) : null}

      <form className="mt-6 grid gap-6" onSubmit={submit}>
        <section className="grid gap-4 rounded-xl border border-border bg-card px-5 py-6" aria-labelledby="paper-meta">
          <h2 id="paper-meta" className="text-[1.15rem]">
            试卷信息
          </h2>
          <div className="grid gap-4 reading:grid-cols-4">
            <label className={field}>
              <span>考试科目</span>
              <select
                className={selectClass}
                value={draft.subjectCode}
                onChange={(event) => update({ subjectCode: event.target.value })}
              >
                {subjects.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={field}>
              <span>年份</span>
              <Input
                type="number"
                min={2000}
                max={2100}
                value={draft.year}
                onChange={(event) => update({ year: event.target.value })}
              />
            </label>
            <label className={`${field} reading:col-span-2`}>
              <span>标题</span>
              <Input value={draft.title} onChange={(event) => update({ title: event.target.value })} />
            </label>
          </div>
          <label className={field}>
            <span>来源与权利说明（不得包含题目原文或答案）</span>
            <Input value={draft.sourceNote} onChange={(event) => update({ sourceNote: event.target.value })} />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-[0.95rem]">
            <input
              type="checkbox"
              checked={draft.rightsConfirmed}
              onChange={(event) => update({ rightsConfirmed: event.target.checked })}
            />
            <span>本人拥有本卷内容或已获得授权，愿对提交内容负责</span>
          </label>
        </section>

        <ol className="grid gap-5">
          {draft.questions.map((question, index) => (
            <QuestionEditor
              key={index}
              index={index}
              question={question}
              removable={draft.questions.length > 1}
              onChange={(patch) => updateQuestion(index, patch)}
              onRemove={() => removeQuestion(index)}
            />
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={draft.questions.length >= PAPER_MAX_QUESTIONS}
            onClick={addQuestion}
          >
            添加一题
          </Button>
          <Button type="submit" className="min-h-11" disabled={busy}>
            {busy ? "提交中…" : "提交待审核"}
          </Button>
          <Badge variant="outline">先审后发</Badge>
        </div>
      </form>
    </main>
  )
}
