import { useId, useState } from "react"

import { putSubmissionSubtitlesSchema } from "@mykaoyan/core"
import { Button, Field, FieldLabel, Input } from "@mykaoyan/ui"

import { fetchSubtitleText, putSubtitles } from "./api"
import type { SubtitleMeta } from "./api"
import { defaultSubtitleMeta, readSubtitleFile, subtitleLimitProblem } from "./subtitles"
import type { SubtitleFormat } from "./subtitles"
type ExistingTrack = { kind: "existing"; language: string; label: string }
type NewTrack = {
  kind: "new"
  language: string
  label: string
  format: SubtitleFormat
  content: string
  fileName: string
}
type EditorTrack = ExistingTrack | NewTrack
/**
 * 本人视频投稿的字幕管理：最多两条，整体替换。
 *
 * 已保存的字幕在保存时按语言取回归一化正文再回传，未改动的字幕不会丢。
 */
export function SubmissionSubtitleEditor({
  submissionId,
  initial,
  onSaved,
}: {
  submissionId: string
  initial: SubtitleMeta[]
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false),
    [tracks, setTracks] = useState<EditorTrack[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("")
  const id = useId()
  function start() {
    setTracks(initial.map((track) => ({ kind: "existing", language: track.language, label: track.label })))
    setMessage("")
    setOpen(true)
  }
  async function add(file: File) {
    const problem = subtitleLimitProblem(tracks.length)
    if (problem) {
      setMessage(problem)
      return
    }
    try {
      const { format, content } = await readSubtitleFile(file)
      setTracks((current) => {
        const meta = defaultSubtitleMeta(file.name, current)
        return [...current, { kind: "new", format, content, fileName: file.name, ...meta }]
      })
      setMessage("")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "字幕文件读取失败")
    }
  }
  async function save() {
    setBusy(true)
    setMessage("")
    try {
      const payload: { language: string; label: string; format: SubtitleFormat; content: string }[] = []
      for (const track of tracks)
        payload.push(
          track.kind === "existing"
            ? {
                language: track.language,
                label: track.label,
                format: "vtt",
                content: await fetchSubtitleText(submissionId, track.language),
              }
            : { language: track.language, label: track.label, format: track.format, content: track.content },
        )
      const parsed = putSubmissionSubtitlesSchema.safeParse({ tracks: payload })
      if (!parsed.success)
        throw new Error("字幕需为0到2条、语言不重复且单条不超过256KiB；语言标签示例：zh、zh-Hans、en。")
      await putSubtitles(submissionId, parsed.data.tracks)
      setOpen(false)
      setMessage("字幕已保存。")
      onSaved()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "字幕保存失败")
    } finally {
      setBusy(false)
    }
  }
  if (!open)
    return (
      <div className="flex flex-col gap-2">
        <Button className="min-h-11 self-start" type="button" variant="outline" onClick={start}>
          管理字幕（{initial.length}/2）
        </Button>
        {message ? <p role="status">{message}</p> : null}
      </div>
    )
  return (
    <div className="flex flex-col gap-3 border-s-2 border-border ps-3">
      <p className="text-sm text-muted-foreground">最多两条SRT/VTT字幕；保存时会整体替换，只有本人且审核前可以修改。</p>
      {tracks.length ? (
        <ul className="flex flex-col gap-3">
          {tracks.map((track, index) => (
            <li key={track.kind === "existing" ? `existing-${track.language}` : `${track.fileName}-${index}`}>
              <div className="flex flex-wrap items-end gap-3">
                <Field className="min-w-40">
                  <FieldLabel htmlFor={`${id}-language-${index}`}>语言标签</FieldLabel>
                  <Input
                    className="min-h-11"
                    id={`${id}-language-${index}`}
                    value={track.language}
                    pattern="[a-z]{2,3}(-[A-Za-z0-9]{2,8})*"
                    readOnly={track.kind === "existing"}
                    onChange={(e) =>
                      setTracks((current) =>
                        current.map((entry, at) =>
                          at === index && entry.kind === "new" ? { ...entry, language: e.target.value } : entry,
                        ),
                      )
                    }
                    disabled={busy}
                  />
                </Field>
                <Field className="min-w-40">
                  <FieldLabel htmlFor={`${id}-label-${index}`}>显示名</FieldLabel>
                  <Input
                    className="min-h-11"
                    id={`${id}-label-${index}`}
                    value={track.label}
                    maxLength={50}
                    readOnly={track.kind === "existing"}
                    onChange={(e) =>
                      setTracks((current) =>
                        current.map((entry, at) =>
                          at === index && entry.kind === "new" ? { ...entry, label: e.target.value } : entry,
                        ),
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
                  onClick={() => setTracks((current) => current.filter((_entry, at) => at !== index))}
                >
                  移除
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {track.kind === "existing"
                  ? "已保存字幕（保存时按原语言取回）"
                  : `${track.fileName}（${track.format.toUpperCase()}）`}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>还没有字幕。</p>
      )}
      <Field className="max-w-md">
        <FieldLabel htmlFor={`${id}-file`}>添加字幕文件（SRT/VTT，最多2条）</FieldLabel>
        <Input
          className="min-h-11"
          id={`${id}-file`}
          type="file"
          accept=".srt,.vtt"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (file) void add(file)
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button className="min-h-11" type="button" disabled={busy} onClick={() => void save()}>
          保存字幕
        </Button>
        <Button className="min-h-11" type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
          取消
        </Button>
      </div>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  )
}
