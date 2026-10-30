import { useEffect, useState } from "react"
import { Button } from "@mykaoyan/ui"
import { MembershipAction, MembershipHelp } from "../membership"
import type { MembershipAccess } from "../membership"
import { LessonPlayer } from "../playback"
import { SubmissionRequestError, submissionRequest } from "./api"
import type { OwnSubmission, Submission, SubmissionList } from "./api"
import { SubmissionUploadForm } from "./upload-form"
import { RatingControl, RatingFilters, RatingStats } from "../ratings"
import type { RatedSubmission } from "./api"
export const submissionStatus = { uploading: "上传未完成", pending: "待审核", approved: "已通过", rejected: "已驳回" }
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
  return (
    <li className="flex flex-col gap-3 border-b border-border py-5">
      <h3 className="text-lg wrap-break-word">{item.title}</h3>
      <p className="whitespace-pre-wrap wrap-break-word">{item.summary}</p>
      <p className="text-sm text-muted-foreground">
        {item.author} · 考试科目 {item.subjectCode}
        {item.topicId ? ` · ${item.topicId}` : ""} · {submissionStatus[item.status]}
        {item.status === "approved" ? (item.listed ? "，已上架" : "，未上架") : ""}
      </p>
      {playable && item.status !== "uploading" ? (
        <Button
          variant="outline"
          className="min-h-11 self-start"
          onClick={() => setPreview(!preview)}
          aria-expanded={preview}
        >
          {preview ? "收起视频" : "播放视频"}
        </Button>
      ) : null}
      {playable && preview ? <LessonPlayer key={item.id} slug={item.id} title={item.title} kind="submissions" /> : null}
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
        `submissions?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}&page=${page}`
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
          <p>投稿按加权平均分排序；至少5人评分且得分达到4.0时显示推荐。</p>
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
            <MembershipAction label="投稿视频" access={access} onAllowed={() => edit(null)} />
          </div>
          {open && access === "member" ? (
            <SubmissionUploadForm
              key={formKey}
              subjectCode={subject}
              resume={resume}
              onDone={() => {
                setOpen(false)
                setReload((n) => n + 1)
              }}
              onDenied={(s) => {
                setAccess(s === 401 ? "guest" : "nonmember")
                setMessage("投稿权限已变化，请确认会员期或社区开放状态。")
              }}
            />
          ) : null}
          {open && access !== "member" ? <MembershipHelp guest={access === "guest"} /> : null}
          {list.items.length ? (
            <ul>
              {list.items.map((item) => (
                <SubmissionCard key={item.id} item={item}>
                  <RatingStats value={item} />
                  <RatingControl submissionId={item.id} access={access} onSaved={() => setReload((n) => n + 1)} />
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
                  {mine.items.map((item) => (
                    <SubmissionCard key={item.id} item={item} playable={!item.deleted && !item.deleteMarked}>
                      {item.reason ? <p>驳回原因：{item.reason}</p> : null}
                      {item.deleted ? (
                        <p>原文件已清理；审核记录保留。</p>
                      ) : item.deleteMarked ? (
                        <p>原文件等待清理，暂停播放。</p>
                      ) : null}
                      {item.status === "uploading" ? (
                        <div>
                          <MembershipAction label="继续此投稿" access={access} onAllowed={() => edit(item)} />
                        </div>
                      ) : null}
                    </SubmissionCard>
                  ))}
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
