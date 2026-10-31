import { useEffect, useState } from "react"

import { Button, Field, FieldGroup, FieldLabel, Textarea } from "@mykaoyan/ui"

import { CommentCard } from "../comments"
import type { CommentItem } from "../comments"
import { MembershipHelp } from "../membership"
import { submissionRequest } from "./api"
export type SubmissionCommentViewer = { signedIn: boolean; member: boolean; owner: boolean }
export type SubmissionCommentList = {
  enabled: boolean
  items: CommentItem[]
  hasMore: boolean
  viewer?: SubmissionCommentViewer
}
/** 只有登录、有效会员与投稿上传者本人能发评论；上传者本人免会员。 */
export function submissionCommentAccess(viewer: SubmissionCommentViewer | undefined) {
  if (!viewer?.signedIn) return "login" as const
  if (viewer.owner) return "owner" as const
  return viewer.member ? ("member" as const) : ("membership" as const)
}
export function SubmissionCommentPanel({ submissionId }: { submissionId: string }) {
  const [data, setData] = useState<SubmissionCommentList | null>(null),
    [page, setPage] = useState(0),
    [message, setMessage] = useState(""),
    [body, setBody] = useState(""),
    [reply, setReply] = useState<CommentItem | null>(null),
    [form, setForm] = useState(false),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setMessage("")
    void submissionRequest<SubmissionCommentList>(`submissions/${submissionId}/comments?page=${page}`)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((error) => {
        if (!active) return
        setData(null)
        setMessage(error instanceof Error ? error.message : "评论读取失败")
      })
    return () => {
      active = false
    }
  }, [submissionId, page, reload])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      await submissionRequest(`submissions/${submissionId}/comments`, "POST", {
        body,
        parentId: reply?.id ?? null,
      })
      setBody("")
      setReply(null)
      setForm(false)
      setPage(0)
      setReload((value) => value + 1)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发送失败")
      setForm(false)
      setReload((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }
  const access = submissionCommentAccess(data?.viewer)
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h4 className="text-base">评论</h4>
      {message ? (
        <p role="alert" className="text-sm">
          {message}
        </p>
      ) : null}
      {!data ? (
        <p className="text-sm text-muted-foreground">正在读取评论…</p>
      ) : !data.enabled ? (
        <p className="text-sm text-muted-foreground">投稿评论暂未开放。</p>
      ) : (
        <>
          {access === "login" || access === "membership" ? <MembershipHelp guest={access === "login"} /> : null}
          {access === "member" || access === "owner" ? (
            <div className="flex flex-wrap items-center gap-3">
              {access === "owner" ? (
                <span className="text-sm text-muted-foreground">你是投稿上传者，评论免会员。</span>
              ) : null}
              <Button
                variant="outline"
                className="min-h-11"
                type="button"
                disabled={busy}
                onClick={() => {
                  setReply(null)
                  setForm(true)
                }}
              >
                发表评论
              </Button>
            </div>
          ) : null}
          {form ? (
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`submission-comment-${submissionId}`}>
                    {reply ? `回复 ${reply.author}` : "评论内容"}
                  </FieldLabel>
                  <Textarea
                    id={`submission-comment-${submissionId}`}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    maxLength={2000}
                    disabled={busy}
                    required
                  />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={busy}>
                    {busy ? "正在发送…" : "发送评论"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setForm(false)
                      setReply(null)
                      setBody("")
                    }}
                  >
                    取消
                  </Button>
                </div>
              </FieldGroup>
            </form>
          ) : null}
          {!data.items.length ? (
            <p className="text-sm text-muted-foreground">还没有评论。</p>
          ) : (
            <ul>
              {data.items.map((item) => (
                <CommentCard key={item.id} item={item}>
                  {!item.parentId && !item.deleted && (access === "member" || access === "owner") ? (
                    <Button
                      className="mbs-2 min-h-11"
                      variant="outline"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setReply(item)
                        setForm(true)
                      }}
                    >
                      回复
                    </Button>
                  ) : null}
                </CommentCard>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" disabled={page === 0 || busy} onClick={() => setPage((value) => value - 1)}>
              上一页评论
            </Button>
            <span>第 {page + 1} 页</span>
            <Button variant="outline" disabled={!data.hasMore || busy} onClick={() => setPage((value) => value + 1)}>
              下一页评论
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
/** 列表默认不展开评论区，避免一次请求几十个投稿的评论。 */
export function SubmissionComments({ submissionId }: { submissionId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        className="min-h-11 self-start"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "收起评论" : "查看评论"}
      </Button>
      {open ? <SubmissionCommentPanel submissionId={submissionId} /> : null}
    </div>
  )
}
