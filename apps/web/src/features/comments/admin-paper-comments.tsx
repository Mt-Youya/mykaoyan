import { useEffect, useState } from "react"

import { Button, Field, FieldGroup, FieldLabel, Input } from "@mykaoyan/ui"

import { commentRequest } from "./api"
import type { CommentItem } from "./api"
import { CommentCard } from "./comments-panel"
type AdminPaperComment = CommentItem & {
  paperSlug: string
  paperTitle: string
  paperSubjectCode: string
  paperOrigin: string
  paperReviewStatus: string
  paperListed: boolean
  deletedAt: string | null
  deletedBy: string | null
  deleteReason: string | null
}
type PaperCommentState = "all" | "visible" | "deleted"
/** 试卷评论管理的数据地址：与投稿评论管理同构，多一个删除状态筛选。 */
export function adminPaperCommentsPath(page: number, q: string, state: PaperCommentState): string {
  return `admin/paper-comments?page=${page}&q=${encodeURIComponent(q)}&state=${state}`
}
export function paperCommentsAdminHref(item: Pick<AdminPaperComment, "paperSlug" | "paperOrigin">): string {
  return item.paperOrigin === "user"
    ? `/community/papers/${encodeURIComponent(item.paperSlug)}`
    : `/exams/${encodeURIComponent(item.paperSlug)}`
}
const statusLabel: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
}
const stateOptions: { value: PaperCommentState; label: string }[] = [
  { value: "all", label: "全部评论" },
  { value: "visible", label: "未删除" },
  { value: "deleted", label: "已删除" },
]
export function AdminPaperCommentsPanel() {
  const [list, setList] = useState<{ items: AdminPaperComment[]; hasMore: boolean } | null>(null),
    [page, setPage] = useState(0),
    [keyword, setKeyword] = useState(""),
    [state, setState] = useState<PaperCommentState>("all"),
    [applied, setApplied] = useState({ keyword: "", state: "all" as PaperCommentState }),
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
    void commentRequest<{ items: AdminPaperComment[]; hasMore: boolean }>(
      adminPaperCommentsPath(page, applied.keyword, applied.state),
    )
      .then((result) => {
        if (active) setList(result)
      })
      .catch((error) => {
        if (active) {
          setList(null)
          setMessage(error instanceof Error ? error.message : "试卷评论读取失败")
        }
      })
    return () => {
      active = false
    }
  }, [page, applied, reload])
  function filter(event: React.FormEvent) {
    event.preventDefault()
    setPage(0)
    setApplied({ keyword: keyword.trim(), state })
  }
  async function remove(event: React.FormEvent) {
    event.preventDefault()
    if (!target) return
    setBusy(true)
    setMessage("")
    try {
      await commentRequest(`admin/paper-comments/${target}`, "DELETE", { reason })
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
    <section aria-labelledby="admin-paper-comments" className="mt-10 border-t border-border pt-6">
      <h2 id="admin-paper-comments" className="text-xl">
        试卷评论管理
      </h2>
      <p className="mt-2 text-muted-foreground">
        试卷评论与讲、投稿评论共用禁止关键词；删除保留操作管理员、时间和原因，重复删除不会覆盖记录。
      </p>
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={filter}>
        <Field className="min-w-60">
          <FieldLabel htmlFor="paper-comments-keyword">试卷标题或评论关键词</FieldLabel>
          <Input
            id="paper-comments-keyword"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            maxLength={100}
          />
        </Field>
        <label className="grid gap-1.5 text-[0.95rem]">
          <span>删除状态</span>
          <select
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-base md:text-sm"
            value={state}
            onChange={(event) => setState(event.target.value as PaperCommentState)}
          >
            {stateOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" className="min-h-11" disabled={busy}>
          筛选
        </Button>
      </form>
      {message ? (
        <p className="mt-3" role="status">
          {message}
        </p>
      ) : null}
      {list ? (
        <>
          <ul className="mt-4">
            {list.items.map((item) => (
              <CommentCard key={item.id} item={item}>
                <p className="mt-2 text-sm">
                  <a href={paperCommentsAdminHref(item)} className="underline underline-offset-4">
                    {item.paperTitle}
                  </a>{" "}
                  · {item.paperOrigin === "user" ? "用户投稿" : "真题"} ·{" "}
                  {statusLabel[item.paperReviewStatus] ?? item.paperReviewStatus}
                  {item.paperReviewStatus === "approved" ? (item.paperListed ? "，已上架" : "，未上架") : ""}
                </p>
                {item.deleted ? (
                  <p className="text-sm break-words text-muted-foreground">
                    删除原因：{item.deleteReason} · 管理员：{item.deletedBy ?? "账号已删除"} · {item.deletedAt}
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 min-h-11"
                    disabled={busy}
                    onClick={() => {
                      setTarget(item.id)
                      setReason("")
                    }}
                  >
                    删除这条试卷评论
                  </Button>
                )}
              </CommentCard>
            ))}
          </ul>
          {target ? (
            <form className="mt-4 max-w-lg" onSubmit={remove}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="delete-paper-comment-reason">删除原因（必填）</FieldLabel>
                  <Input
                    id="delete-paper-comment-reason"
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
          <div className="mt-4 flex items-center gap-3">
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
        <p className="mt-4">{message || "正在读取试卷评论…"}</p>
      )}
      <Button
        className="mt-4"
        variant="outline"
        type="button"
        disabled={busy}
        onClick={() => setReload((value) => value + 1)}
      >
        刷新试卷评论管理
      </Button>
    </section>
  )
}
