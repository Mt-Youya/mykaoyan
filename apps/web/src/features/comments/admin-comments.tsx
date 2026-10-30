import { useEffect, useState } from "react"

import { Button, Field, FieldGroup, FieldLabel, Input, Textarea } from "@mykaoyan/ui"

import { commentRequest } from "./api"
import type { AdminComment } from "./api"
import { CommentCard } from "./comments-panel"
export function AdminCommentsPanel() {
  const [list, setList] = useState<{ items: AdminComment[]; hasMore: boolean } | null>(null),
    [keywords, setKeywords] = useState(""),
    [page, setPage] = useState(0),
    [target, setTarget] = useState<string | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [reload, setReload] = useState(0),
    [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let active = true
    setLoaded(false)
    setMessage("")
    setTarget(null)
    setReason("")
    void Promise.all([
      commentRequest<{ items: AdminComment[]; hasMore: boolean }>(`admin/comments?page=${page}`),
      commentRequest<{ keywords: string[] }>("admin/comments/keywords"),
    ])
      .then(([data, words]) => {
        if (active) {
          setList(data)
          setKeywords(words.keywords.join("\n"))
          setLoaded(true)
        }
      })
      .catch((error) => {
        if (active) setMessage(error.message)
      })
    return () => {
      active = false
    }
  }, [page, reload])
  async function saveKeywords(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      const result = await commentRequest<{ keywords: string[] }>("admin/comments/keywords", "PUT", {
        keywords: keywords
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean),
      })
      setKeywords(result.keywords.join("\n"))
      setMessage("关键词已保存。")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败")
    } finally {
      setBusy(false)
    }
  }
  async function remove(event: React.FormEvent) {
    event.preventDefault()
    if (!target) return
    setBusy(true)
    setMessage("")
    try {
      await commentRequest(`admin/comments/${target}`, "DELETE", { reason })
      setTarget(null)
      setReason("")
      setReload((v) => v + 1)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败")
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="mbs-10 border-t border-border pbs-6" aria-labelledby="admin-comments">
      <h2 id="admin-comments" className="text-xl">
        评论管理
      </h2>
      <p className="mbs-2 text-muted-foreground">删除保留操作管理员、时间和原因；重复删除不会覆盖记录。</p>
      {message ? (
        <p className="mbs-3" role="status">
          {message}
        </p>
      ) : null}
      <form className="mbs-4 max-w-lg" onSubmit={saveKeywords}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="comment-keywords">禁止关键词（每行一个，最多500个）</FieldLabel>
            <Textarea
              id="comment-keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              disabled={busy || !loaded}
            />
          </Field>
          <Button type="submit" disabled={busy || !loaded}>
            保存关键词
          </Button>
        </FieldGroup>
      </form>
      {list ? (
        <>
          <ul className="mbs-4">
            {list.items.map((item) => (
              <CommentCard key={item.id} item={item}>
                <p className="mbs-2 text-sm">
                  <a href={`/lessons/${encodeURIComponent(item.lessonSlug)}`} className="underline">
                    查看所在讲
                  </a>
                </p>
                {item.deleted ? (
                  <p className="text-sm break-words text-muted-foreground">
                    删除原因：{item.deleteReason} · 管理员：{item.deletedBy ?? "账号已删除"} · {item.deletedAt}
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="mbs-2"
                    disabled={busy || !loaded}
                    onClick={() => {
                      setTarget(item.id)
                      setReason("")
                    }}
                  >
                    删除这条评论
                  </Button>
                )}
              </CommentCard>
            ))}
          </ul>
          {target ? (
            <form className="mbs-4 max-w-lg" onSubmit={remove}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="delete-comment-reason">删除原因（必填）</FieldLabel>
                  <Input
                    id="delete-comment-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
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
            <Button variant="outline" disabled={page === 0 || busy} onClick={() => setPage((v) => v - 1)}>
              上一页
            </Button>
            <span>第 {page + 1} 页</span>
            <Button variant="outline" disabled={!list.hasMore || busy} onClick={() => setPage((v) => v + 1)}>
              下一页
            </Button>
          </div>
        </>
      ) : (
        <p className="mbs-4">{message ? "评论管理暂不可用。" : "正在读取评论…"}</p>
      )}
      <Button className="mbs-4" variant="outline" type="button" disabled={busy} onClick={() => setReload((v) => v + 1)}>
        刷新评论管理
      </Button>
    </section>
  )
}
