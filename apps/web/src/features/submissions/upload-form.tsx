import { useEffect, useRef, useState } from "react"

import { publicTopics, submissionInputSchema } from "@mykaoyan/core"
import { Button, Field, FieldGroup, FieldLabel, Input, Textarea } from "@mykaoyan/ui"

import { SubmissionRequestError, uploadSubmission } from "./api"
import type { OwnSubmission } from "./api"
import { fingerprint, inspectVideo } from "./video"
export function SubmissionUploadForm({
  subjectCode,
  resume,
  onDone,
  onDenied,
}: {
  subjectCode: string
  resume: OwnSubmission | null
  onDone: () => void
  onDenied: (status: number) => void
}) {
  const [title, setTitle] = useState(resume?.title ?? ""),
    [summary, setSummary] = useState(resume?.summary ?? ""),
    [subject, setSubject] = useState(resume?.subjectCode ?? subjectCode),
    [topic, setTopic] = useState(resume?.topicId ?? ""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [progress, setProgress] = useState<number | null>(null)
  const id = useRef<string | null>(resume?.id ?? null),
    abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setMessage("正在检查视频格式与时长…")
    setProgress(null)
    abort.current = new AbortController()
    try {
      const metadata = await inspectVideo(file)
      const hash = await fingerprint(file, (n) => setMessage(`正在核对文件：${n}%`), abort.current.signal)
      if (abort.current.signal.aborted) throw new Error("上传已暂停")
      if (resume && (resume.fingerprint !== hash || resume.size !== file.size))
        throw new Error("续传须选择同一个原文件")
      id.current ??= crypto.randomUUID()
      const parsed = submissionInputSchema.safeParse({
        id: id.current,
        title,
        summary,
        subjectCode: subject,
        topicId: topic || null,
        size: file.size,
        fingerprint: hash,
        ...metadata,
      })
      if (!parsed.success) {
        if (!resume) id.current = null
        throw new Error("请填写非空标题、有效考试科目，并确认所选考点属于该科目")
      }
      setMessage("正在直传视频…")
      setProgress(0)
      await uploadSubmission(file, parsed.data, abort.current.signal, setProgress)
      setMessage("投稿已登记，等待管理员审核。")
      onDone()
    } catch (error) {
      if (error instanceof SubmissionRequestError && (error.status === 401 || error.status === 403))
        onDenied(error.status)
      setMessage(error instanceof Error ? error.message : "上传失败，可选择原文件续传")
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p>
        {resume
          ? "继续未完成的投稿，选择同一个原视频；已上传分片会保留。"
          : "视频须为mp4/H.264，不超过500MB及30分钟；通过审核后才对访客展示。"}
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="submission-title">标题</FieldLabel>
          <Input
            className="min-h-11"
            id="submission-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            disabled={busy || !!resume || !!id.current}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="submission-summary">简介</FieldLabel>
          <Textarea
            id="submission-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={2000}
            disabled={busy || !!resume || !!id.current}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="submission-subject">考试科目代码（三位数字）</FieldLabel>
          <Input
            className="min-h-11"
            id="submission-subject"
            value={subject}
            pattern="[0-9]{3}"
            maxLength={3}
            required
            onChange={(e) => {
              setSubject(e.target.value)
              setTopic("")
            }}
            disabled={busy || !!resume || !!id.current}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="submission-topic">考点（选填）</FieldLabel>
          <select
            id="submission-topic"
            className="min-h-11 rounded-md border border-input bg-background px-3 focus-visible:outline-2 focus-visible:outline-ring"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={busy || !!resume || !!id.current}
          >
            <option value="">不指定考点</option>
            {publicTopics
              .filter((t) => t.subject === subject)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} {t.title}
                </option>
              ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="submission-file">mp4视频</FieldLabel>
          <Input
            className="min-h-11"
            id="submission-file"
            type="file"
            accept=".mp4,video/mp4"
            required
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button className="min-h-11" type="submit" disabled={busy || !file}>
            {resume || id.current ? "继续上传" : "上传并提交审核"}
          </Button>
          {busy ? (
            <Button className="min-h-11" type="button" variant="outline" onClick={() => abort.current?.abort()}>
              暂停上传
            </Button>
          ) : null}
        </div>
      </FieldGroup>
      {progress !== null ? (
        <label className="flex flex-col gap-2">
          上传进度：{progress}%<progress className="w-full" max={100} value={progress} />
        </label>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </form>
  )
}
