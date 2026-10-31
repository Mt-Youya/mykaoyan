import { useEffect, useRef, useState } from "react"

import { publicTopics, putSubmissionSubtitlesSchema, submissionInputSchema } from "@mykaoyan/core"
import { Button, Field, FieldGroup, FieldLabel, Input, Textarea } from "@mykaoyan/ui"

import { putSubtitles, SubmissionRequestError, uploadSubmission } from "./api"
import type { OwnSubmission } from "./api"
import { ManuscriptSubmissionForm } from "./manuscript-form"
import { defaultSubtitleMeta, readSubtitleFile, subtitleLimitProblem } from "./subtitles"
import type { SubtitleFormat } from "./subtitles"
import { fingerprint, inspectVideo } from "./video"
type SubtitleDraft = {
  fileName: string
  language: string
  label: string
  format: SubtitleFormat
  content: string
}
function VideoSubmissionForm({
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
    [subtitles, setSubtitles] = useState<SubtitleDraft[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [subtitleMessage, setSubtitleMessage] = useState(""),
    [progress, setProgress] = useState<number | null>(null)
  const id = useRef<string | null>(resume?.id ?? null),
    abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  async function addSubtitle(file: File) {
    const limit = subtitleLimitProblem(subtitles.length)
    if (limit) {
      setSubtitleMessage(limit)
      return
    }
    try {
      const { format, content } = await readSubtitleFile(file)
      setSubtitles((current) => [
        ...current,
        { fileName: file.name, format, content, ...defaultSubtitleMeta(file.name, current) },
      ])
      setSubtitleMessage("")
    } catch (error) {
      setSubtitleMessage(error instanceof Error ? error.message : "字幕文件读取失败")
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return
    const tracks = subtitles.map(({ language, label, format, content }) => ({ language, label, format, content }))
    const parsedSubtitles = putSubmissionSubtitlesSchema.safeParse({ tracks })
    if (!parsedSubtitles.success) {
      setSubtitleMessage("字幕需为0到2条，语言不重复且单条不超过256KiB；请检查语言标签与显示名。")
      return
    }
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
      const result = await uploadSubmission(file, parsed.data, abort.current.signal, setProgress)
      if (subtitles.length) {
        setMessage("视频已登记，正在保存字幕…")
        await putSubtitles(result.id, parsedSubtitles.data.tracks)
      }
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
          : "视频须为mp4/H.264，不超过500MB及30分钟；可选附带最多两条SRT/VTT字幕；通过审核后才对访客展示。"}
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
              .filter((entry) => entry.subject === subject)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.id} {entry.title}
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
        <fieldset className="flex flex-col gap-3 border border-border p-3">
          <legend className="px-1 text-sm">字幕（选填，最多2条）</legend>
          {subtitles.length ? (
            <ul className="flex flex-col gap-3">
              {subtitles.map((track, index) => (
                <li key={`${track.fileName}-${index}`} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <Field className="min-w-40">
                      <FieldLabel htmlFor={`submission-subtitle-language-${index}`}>语言标签</FieldLabel>
                      <Input
                        className="min-h-11"
                        id={`submission-subtitle-language-${index}`}
                        value={track.language}
                        pattern="[a-z]{2,3}(-[A-Za-z0-9]{2,8})*"
                        onChange={(e) =>
                          setSubtitles((current) =>
                            current.map((entry, at) => (at === index ? { ...entry, language: e.target.value } : entry)),
                          )
                        }
                        disabled={busy}
                      />
                    </Field>
                    <Field className="min-w-40">
                      <FieldLabel htmlFor={`submission-subtitle-label-${index}`}>显示名</FieldLabel>
                      <Input
                        className="min-h-11"
                        id={`submission-subtitle-label-${index}`}
                        value={track.label}
                        maxLength={50}
                        onChange={(e) =>
                          setSubtitles((current) =>
                            current.map((entry, at) => (at === index ? { ...entry, label: e.target.value } : entry)),
                          )
                        }
                        disabled={busy}
                      />
                    </Field>
                    <Button
                      className="min-h-11"
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setSubtitles((current) => current.filter((_entry, at) => at !== index))}
                    >
                      移除
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {track.fileName}（{track.format.toUpperCase()}）
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">还没有添加字幕；审核前可在“我的投稿”里继续修改。</p>
          )}
          <Input
            className="min-h-11"
            type="file"
            accept=".srt,.vtt"
            aria-label="添加字幕文件"
            disabled={busy}
            onChange={(e) => {
              const selected = e.target.files?.[0]
              e.target.value = ""
              if (selected) void addSubtitle(selected)
            }}
          />
          {subtitleMessage ? <p role="alert">{subtitleMessage}</p> : null}
        </fieldset>
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
/** 投稿表单：视频（含可选字幕）与手稿两种形态；上传只要求登录。 */
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
  const [kind, setKind] = useState<"video" | "manuscript">("video")
  if (resume)
    return <VideoSubmissionForm subjectCode={subjectCode} resume={resume} onDone={onDone} onDenied={onDenied} />
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="text-sm">投稿形态</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="submission-kind"
            value="video"
            checked={kind === "video"}
            onChange={() => setKind("video")}
          />
          视频
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="submission-kind"
            value="manuscript"
            checked={kind === "manuscript"}
            onChange={() => setKind("manuscript")}
          />
          手稿
        </label>
      </fieldset>
      {kind === "video" ? (
        <VideoSubmissionForm subjectCode={subjectCode} resume={null} onDone={onDone} onDenied={onDenied} />
      ) : (
        <ManuscriptSubmissionForm subjectCode={subjectCode} onDone={onDone} onDenied={onDenied} />
      )}
    </div>
  )
}
