import { useEffect, useState } from "react"

import { Button } from "@mykaoyan/ui"

import type { MembershipAccess } from "../membership"
import { LessonPlayer } from "../playback"
import { RatingControl, RatingFilters, RatingStats } from "../ratings"
import { submissionRequest, SubmissionRequestError } from "./api"
import type { OwnSubmission, RatedSubmission, Submission, SubmissionList } from "./api"
import { SubmissionComments } from "./comments"
import { manuscriptSizeLabel } from "./manuscript"
import { ManuscriptReader } from "./manuscript-reader"
import { canEditSubtitles, submissionCleanupNote, submissionKind, submissionStatus, uploadEntryMode } from "./model"
import { SubmissionSubtitleEditor } from "./subtitle-editor"
import { SubmissionUploadForm } from "./upload-form"
function UploadEntry({ access, onOpen }: { access: MembershipAccess; onOpen: () => void }) {
  const [help, setHelp] = useState(false)
  const mode = uploadEntryMode(access)
  if (mode === "loading") return <Button disabled>正在读取投稿权限…</Button>
  if (mode === "error") return <Button disabled>投稿权限读取失败，请刷新后重试</Button>
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="min-h-11 self-start"
        type="button"
        variant="outline"
        onClick={() => (mode === "login" ? setHelp(true) : onOpen())}
      >
        {mode === "login" ? "登录后投稿" : "投稿"}
      </Button>
      {help && mode === "login" ? (
        <div role="status" className="mbs-3 border-s-2 border-border ps-3">
          <p>请先登录后再投稿；投稿只要求登录，不要求会员。</p>
          <a className="underline underline-offset-4" href="/login">
            去登录
          </a>
        </div>
      ) : null}
      {access === "nonmember" ? (
        <p className="text-sm text-muted-foreground">投稿只要求登录；评论、评分与查看答案仍需要有效会员。</p>
      ) : null}
    </div>
  )
}
export function SubmissionCard({
  item,
  children,
  playable = true,
}: {
  item: Submission
  children?: React.ReactNode
  playable?: boolean
}) {
  const [preview, setPreview] = useState(false)
  const video = item.kind === "video"
  return (
    <li className="flex flex-col gap-3 border-b border-border py-5">
      <h3 className="text-lg wrap-break-word">{item.title}</h3>
      <p className="wrap-break-word whitespace-pre-wrap">{item.summary}</p>
      <p className="text-sm text-muted-foreground">
        {submissionKind[item.kind]} · {item.author} · 考试科目 {item.subjectCode}
        {item.topicId ? ` · ${item.topicId}` : ""}
        {video && item.duration !== null ? ` · ${Math.round(item.duration)}秒` : ""}
        {!video && item.manuscriptBytes !== null ? ` · ${manuscriptSizeLabel(item.manuscriptBytes)}` : ""} ·{" "}
        {submissionStatus[item.status]}
        {item.status === "approved" ? (item.listed ? "，已上架" : "，未上架") : ""}
      </p>
      {video && playable && item.status !== "uploading" ? (
        <Button
          variant="outline"
          className="min-h-11 self-start"
          onClick={() => setPreview(!preview)}
          aria-expanded={preview}
        >
          {preview ? "收起视频" : "播放视频"}
        </Button>
      ) : null}
      {!video ? <ManuscriptReader submissionId={item.id} disabled={!playable} /> : null}
      {video && playable && preview ? (
        <LessonPlayer key={item.id} slug={item.id} title={item.title} kind="submissions" />
      ) : null}
      {children}
    </li>
  )
}
export function SubmissionsPanel({ subjectCode }: { subjectCode: string }) {
  const [list, setList] = useState<SubmissionList<RatedSubmission> | null>(null),
    [mine, setMine] = useState<SubmissionList<OwnSubmission> | null>(null),
    [access, setAccess] = useState<MembershipAccess>("loading"),
    [page, setPage] = useState(0),
    [minePage, setMinePage] = useState(0),
    [reload, setReload] = useState(0),
    [open, setOpen] = useState(false),
    [resume, setResume] = useState<OwnSubmission | null>(null),
    [formKey, setFormKey] = useState(0),
    [message, setMessage] = useState("")
  const [subject, setSubject] = useState(subjectCode),
    [topic, setTopic] = useState("")
  useEffect(() => {
    let active = true
    setList(null)
    setMine(null)
    setAccess("loading")
    setMessage("")
    setOpen(false)
    void (async () => {
      const data = await submissionRequest<SubmissionList<RatedSubmission>>(
        `submissions?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}&page=${page}`,
      )
      if (!active) return
      setList(data)
      if (!data.enabled) return
      try {
        const status = await submissionRequest<{ active: boolean }>("membership")
        const own = await submissionRequest<SubmissionList<OwnSubmission>>(`submissions/mine?page=${minePage}`)
        if (active) {
          setAccess(status.active ? "member" : "nonmember")
          setMine(own)
        }
      } catch (error) {
        if (active) {
          setAccess(error instanceof SubmissionRequestError && error.status === 401 ? "guest" : "error")
          if (!(error instanceof SubmissionRequestError && error.status === 401)) throw error
        }
      }
    })().catch((e) => {
      if (active) setMessage(e instanceof Error ? e.message : "投稿读取失败")
    })
    return () => {
      active = false
    }
  }, [subject, topic, page, minePage, reload])
  function edit(item: OwnSubmission | null) {
    setResume(item)
    setFormKey((n) => n + 1)
    setOpen(true)
  }
  return (
    <section aria-labelledby="submissions-heading" className="mbs-10 flex flex-col gap-4">
      <h2 id="submissions-heading" className="border-b border-border pbe-2 text-xl">
        投稿
      </h2>
      {message ? <p role="alert">{message}</p> : null}
      {!list ? (
        <p>正在读取投稿…</p>
      ) : !list.enabled ? (
        <p>投稿暂未开放。</p>
      ) : (
        <>
          <p>投稿按加权平均分排序；至少5人评分且得分达到4.0时显示推荐。视频投稿可附带最多两条字幕。</p>
          <RatingFilters
            key={`${subject}:${topic}`}
            subject={subject}
            topic={topic}
            onApply={(nextSubject, nextTopic) => {
              setSubject(nextSubject)
              setTopic(nextTopic)
              setPage(0)
            }}
          />
          <div>
            <UploadEntry access={access} onOpen={() => edit(null)} />
          </div>
          {open && access !== "guest" && access !== "loading" && access !== "error" ? (
            <SubmissionUploadForm
              key={formKey}
              subjectCode={subject}
              resume={resume}
              onDone={() => {
                setOpen(false)
                setResume(null)
                setReload((n) => n + 1)
              }}
              onDenied={(s) => {
                if (s === 401) setAccess("guest")
                setMessage(
                  s === 401
                    ? "登录状态已变化，请重新登录后再投稿。"
                    : "上传被拒绝：社区可能尚未开放；关闭期间不能新增投稿。",
                )
              }}
            />
          ) : null}
          {open && access === "guest" ? (
            <div role="status" className="mbs-3 border-s-2 border-border ps-3">
              <p>登录状态已失效，请重新登录后再投稿。</p>
              <a className="underline underline-offset-4" href="/login">
                去登录
              </a>
            </div>
          ) : null}
          {list.items.length ? (
            <ul>
              {list.items.map((item) => (
                <SubmissionCard key={item.id} item={item}>
                  <RatingStats value={item} />
                  <RatingControl submissionId={item.id} access={access} onSaved={() => setReload((n) => n + 1)} />
                  <SubmissionComments submissionId={item.id} />
                </SubmissionCard>
              ))}
            </ul>
          ) : (
            <p>所选考试科目与考点下还没有已上架的投稿。</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button className="min-h-11" variant="outline" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
              上一页投稿
            </Button>
            <span>第 {page + 1} 页</span>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={!list.hasMore}
              onClick={() => setPage((n) => n + 1)}
            >
              下一页投稿
            </Button>
          </div>
          {mine ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-lg">我的投稿</h3>
              {mine.items.length ? (
                <ul>
                  {mine.items.map((item) => {
                    const cleanup = submissionCleanupNote(item)
                    return (
                      <SubmissionCard key={item.id} item={item} playable={!item.deleted && !item.deleteMarked}>
                        {item.reason ? <p>驳回原因：{item.reason}</p> : null}
                        {item.hasSubtitles ? (
                          <p className="text-sm text-muted-foreground">
                            字幕：{item.subtitleLanguages.length}条（{item.subtitleLanguages.join("、")}）
                          </p>
                        ) : null}
                        {cleanup ? <p>{cleanup}</p> : null}
                        {canEditSubtitles(item) ? (
                          <SubmissionSubtitleEditor
                            submissionId={item.id}
                            initial={item.subtitles}
                            onSaved={() => setReload((n) => n + 1)}
                          />
                        ) : null}
                        {item.status === "uploading" && item.kind === "video" ? (
                          <div>
                            <Button className="min-h-11" type="button" variant="outline" onClick={() => edit(item)}>
                              继续此投稿
                            </Button>
                          </div>
                        ) : null}
                      </SubmissionCard>
                    )
                  })}
                </ul>
              ) : (
                <p>还没有投稿记录。</p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  className="min-h-11"
                  variant="outline"
                  disabled={minePage === 0}
                  onClick={() => setMinePage((n) => n - 1)}
                >
                  上一页记录
                </Button>
                <span>第 {minePage + 1} 页</span>
                <Button
                  className="min-h-11"
                  variant="outline"
                  disabled={!mine.hasMore}
                  onClick={() => setMinePage((n) => n + 1)}
                >
                  下一页记录
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
      <Button variant="outline" className="min-h-11 self-start" onClick={() => setReload((n) => n + 1)}>
        刷新投稿与会员状态
      </Button>
    </section>
  )
}
