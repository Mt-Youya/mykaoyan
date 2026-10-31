import { useEffect, useState } from "react"

import { Button, Field, FieldGroup, FieldLabel, Input } from "@mykaoyan/ui"

import { commentRequest } from "./api"
import type { CommentItem } from "./api"
import { CommentCard } from "./comments-panel"
type AdminSubmissionComment = CommentItem & {
  submissionId: string
  submissionTitle: string
  submissionSubjectCode: string
  submissionStatus: string
  submissionListed: boolean
  deletedAt: string | null
  deletedBy: string | null
  deleteReason: string | null
}
const statusLabel: Record<string, string> = {
  uploading: "上传未完成",
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
}
export function AdminSubmissionCommentsPanel() {
  const [list, setList] = useState<{ items: AdminSubmissionComment[]; hasMore: boolean } | null>(null),
    [page, setPage] = useState(0),
    [target, setTarget] = useState<string | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setMessage("")
    setTarget(null)
    setReason("")
    void commentRequest<{ items: AdminSubmissionComment[]; hasMore: boolean }>(`admin/submission-comments?page=${page}`)
      .then((result) => {
        if (active) setList(result)
      })
      .catch((error) => {
        if (active) {
          setList(null)
          setMessage(error instanceof Error ? error.message : "投稿评论读取失败")
        }
      })
    return () => {
      active = false
    }
  }, [page, reload])
  async function remove(event: React.FormEvent) {
    event.preventDefault()
    if (!target) return
    setBusy(true)
    setMessage("")
    try {
      await commentRequest(`admin/submission-comments/${target}`, "DELETE", { reason })
      setTarget(null)
      setReason("")
      setReload((value) => value + 1)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败")
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-labelledby="admin-submission-comments" className="mbs-10 border-t border-border pbs-6">
      <h2 id="admin-submission-comments" className="text-xl">
        投稿评论管理
      </h2>
      <p className="mbs-2 text-muted-foreground">
        投稿评论与讲评论共用禁止关键词；删除保留操作管理员、时间和原因，重复删除不会覆盖记录。
      </p>
      {message ? (
        <p className="mbs-3" role="status">
          {message}
        </p>
      ) : null}
      {list ? (
        <>
          <ul className="mbs-4">
            {list.items.map((item) => (
              <CommentCard key={item.id} item={item}>
                <p className="mbs-2 text-sm">
                  <a
                    href={`/subjects/${encodeURIComponent(item.submissionSubjectCode)}`}
                    className="underline underline-offset-4"
                  >
                    {item.submissionTitle}
                  </a>{" "}
                  · {statusLabel[item.submissionStatus] ?? item.submissionStatus}
                  {item.submissionStatus === "approved" ? (item.submissionListed ? "，已上架" : "，未上架") : ""}
                </p>
                {item.deleted ? (
                  <p className="text-sm break-words text-muted-foreground">
                    删除原因：{item.deleteReason} · 管理员：{item.deletedBy ?? "账号已删除"} · {item.deletedAt}
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="mbs-2 min-h-11"
                    disabled={busy}
                    onClick={() => {
                      setTarget(item.id)
                      setReason("")
                    }}
                  >
                    删除这条投稿评论
                  </Button>
                )}
              </CommentCard>
            ))}
          </ul>
          {target ? (
            <form className="mbs-4 max-w-lg" onSubmit={remove}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="delete-submission-comment-reason">删除原因（必填）</FieldLabel>
                  <Input
                    id="delete-submission-comment-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={500}
                    required
                    disabled={busy}
                  />
                </Field>
                <div className="flex gap-3">
                  <Button type="submit" disabled={busy}>
                    确认删除
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setTarget(null)}>
                    取消
                  </Button>
                </div>
              </FieldGroup>
            </form>
          ) : null}
          <div className="mbs-4 flex items-center gap-3">
            <Button variant="outline" disabled={page === 0 || busy} onClick={() => setPage((value) => value - 1)}>
              上一页
            </Button>
            <span>第 {page + 1} 页</span>
            <Button variant="outline" disabled={!list.hasMore || busy} onClick={() => setPage((value) => value + 1)}>
              下一页
            </Button>
          </div>
        </>
      ) : (
        <p className="mbs-4">{message || "正在读取投稿评论…"}</p>
      )}
      <Button className="mbs-4" variant="outline" type="button" disabled={busy} onClick={() => setReload((v) => v + 1)}>
        刷新投稿评论管理
      </Button>
    </section>
  )
}
