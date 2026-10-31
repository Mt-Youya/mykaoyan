import { useState } from "react"

import { manuscriptSubmissionInputSchema, publicTopics } from "@mykaoyan/core"
import { Button, Field, FieldGroup, FieldLabel, Input, Textarea } from "@mykaoyan/ui"

import { Markdown } from "../catalog"
import { createManuscript, SubmissionRequestError } from "./api"
import { manuscriptProblem, manuscriptStats } from "./manuscript"
/** 手稿投稿：单请求提交 Markdown 正文，提交后直接进入待审核。 */
export function ManuscriptSubmissionForm({
  subjectCode,
  onDone,
  onDenied,
}: {
  subjectCode: string
  onDone: () => void
  onDenied: (status: number) => void
}) {
  const [title, setTitle] = useState(""),
    [summary, setSummary] = useState(""),
    [subject, setSubject] = useState(subjectCode),
    [topic, setTopic] = useState(""),
    [markdown, setMarkdown] = useState(""),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("")
  const stats = manuscriptStats(markdown)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const problem = manuscriptProblem(stats)
    if (problem) {
      setMessage(problem)
      return
    }
    const parsed = manuscriptSubmissionInputSchema.safeParse({
      id: crypto.randomUUID(),
      kind: "manuscript",
      title,
      summary,
      subjectCode: subject,
      topicId: topic || null,
      manuscriptMarkdown: markdown,
    })
    if (!parsed.success) {
      setMessage("请填写非空标题、有效考试科目，并确认所选考点属于该科目；正文不能包含NUL字符。")
      return
    }
    setBusy(true)
    setMessage("正在提交手稿，等待审核…")
    try {
      await createManuscript(parsed.data)
      setMessage("手稿已提交，等待管理员审核。")
      onDone()
    } catch (error) {
      if (error instanceof SubmissionRequestError && (error.status === 401 || error.status === 403))
        onDenied(error.status)
      setMessage(error instanceof Error ? error.message : "提交失败，请稍后重试")
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p>手稿是Markdown格式的课程文字材料，不需要视频；通过审核并上架后才对访客展示。</p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="manuscript-title">标题</FieldLabel>
          <Input
            className="min-h-11"
            id="manuscript-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            disabled={busy}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="manuscript-summary">简介</FieldLabel>
          <Textarea
            id="manuscript-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={2000}
            disabled={busy}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="manuscript-subject">考试科目代码（三位数字）</FieldLabel>
          <Input
            className="min-h-11"
            id="manuscript-subject"
            value={subject}
            pattern="[0-9]{3}"
            maxLength={3}
            required
            onChange={(e) => {
              setSubject(e.target.value)
              setTopic("")
            }}
            disabled={busy}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="manuscript-topic">考点（选填）</FieldLabel>
          <select
            id="manuscript-topic"
            className="min-h-11 rounded-md border border-input bg-background px-3 focus-visible:outline-2 focus-visible:outline-ring"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={busy}
          >
            <option value="">不指定考点</option>
            {publicTopics
              .filter((entry) => entry.subject === subject)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.id} {entry.title}
                </option>
              ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="manuscript-body">正文（Markdown）</FieldLabel>
          <Textarea
            className="min-h-64 font-mono"
            id="manuscript-body"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            aria-describedby="manuscript-stats"
            disabled={busy}
            required
          />
          <p id="manuscript-stats" className="text-sm text-muted-foreground">
            已写{stats.chars}字符、UTF-8 {stats.bytes}字节；上限100万字符且1MiB。
          </p>
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button className="min-h-11" type="submit" disabled={busy}>
            提交手稿审核
          </Button>
          <Button
            className="min-h-11"
            type="button"
            variant="outline"
            onClick={() => setPreview((value) => !value)}
            aria-expanded={preview}
          >
            {preview ? "收起预览" : "预览手稿"}
          </Button>
        </div>
      </FieldGroup>
      {preview ? (
        <div className="border border-border p-4" aria-label="手稿预览">
          {markdown ? <Markdown markdown={markdown} /> : <p>还没有正文。</p>}
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </form>
  )
}
