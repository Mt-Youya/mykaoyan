import { Button, Field, FieldGroup, FieldLabel, Textarea } from "@mykaoyan/ui"
import { useEffect, useState } from "react"
import { MembershipAction, MembershipHelp } from "../membership"
import type { MembershipAccess } from "../membership"
import { commentRequest, CommentRequestError } from "./api"
import type { CommentItem, CommentList } from "./api"
export function CommentCard({ item, children }: { item: CommentItem; children?: React.ReactNode }) {
  return (
    <li className="border-b border-border py-4">
      <p className="text-sm text-muted-foreground">
        {item.author} ·{" "}
        {new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Shanghai",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(item.createdAt))}
      </p>
      {item.parent ? (
        <blockquote className="mbs-2 border-s-2 border-border ps-3 text-sm text-muted-foreground">
          回复 {item.parent.author}：{item.parent.body}
        </blockquote>
      ) : null}
      <p className="mbs-2 whitespace-pre-wrap break-words">{item.deleted ? "已删除" : item.body}</p>
      {children}
    </li>
  )
}
export function CommentsPanel({ slug }: { slug: string }) {
  const [data, setData] = useState<CommentList | null>(null),
    [page, setPage] = useState(0),
    [access, setAccess] = useState<MembershipAccess>("loading"),
    [message, setMessage] = useState(""),
    [body, setBody] = useState(""),
    [reply, setReply] = useState<CommentItem | null>(null),
    [form, setForm] = useState(false),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setData(null)
    setMessage("")
    setForm(false)
    setReply(null)
    setBody("")
    setAccess("loading")
    void commentRequest<CommentList>(`lessons/${encodeURIComponent(slug)}/comments?page=${page}`)
      .then(async (result) => {
        if (!active) return
        setData(result)
        if (!result.enabled) return
        try {
          const membership = await commentRequest<{ active: boolean }>("membership")
          if (active) setAccess(membership.active ? "member" : "nonmember")
        } catch (error) {
          if (active) setAccess(error instanceof CommentRequestError && error.status === 401 ? "guest" : "error")
        }
      })
      .catch((error) => {
        if (active) {
          setMessage(error.message)
          setAccess("error")
        }
      })
    return () => {
      active = false
    }
  }, [slug, page, reload])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      await commentRequest(`lessons/${encodeURIComponent(slug)}/comments`, "POST", {
        body,
        parentId: reply?.id ?? null,
      })
      setBody("")
      setReply(null)
      setForm(false)
      setPage(0)
      setReload((v) => v + 1)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发送失败")
      if (error instanceof CommentRequestError && (error.status === 401 || error.status === 403)) {
        setAccess(error.status === 401 ? "guest" : "nonmember")
        setForm(false)
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="mbs-10 border-t border-border pbs-6" aria-labelledby="comments-title">
      <h2 id="comments-title" className="text-xl">
        评论
      </h2>
      {!data ? (
        <p>{message || "正在读取评论…"}</p>
      ) : !data.enabled ? (
        <p>评论暂未开放。</p>
      ) : (
        <>
          <div className="mbs-4">
            <MembershipAction
              disabled={busy}
              access={access}
              label="发表评论"
              onAllowed={() => {
                setForm(true)
                setReply(null)
              }}
            />
          </div>
          {access === "error" ? <p role="alert">无法确认会员状态，请重新加载后重试。</p> : null}
          {message ? (
            <>
              <p className="mbs-3" role="alert">
                {message}
              </p>
              {access === "guest" || access === "nonmember" ? <MembershipHelp guest={access === "guest"} /> : null}
            </>
          ) : null}
          {form ? (
            <form className="mbs-4" onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="comment-body">{reply ? `回复 ${reply.author}` : "评论内容"}</FieldLabel>
                  <Textarea
                    id="comment-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
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
            <p className="mbs-4 text-muted-foreground">还没有评论。</p>
          ) : (
            <ul className="mbs-4">
              {data.items.map((item) => (
                <CommentCard key={item.id} item={item}>
                  {!item.parentId && !item.deleted ? (
                    <div className="mbs-3">
                      <MembershipAction
                        disabled={busy}
                        access={access}
                        label="回复"
                        onAllowed={() => {
                          setReply(item)
                          setForm(true)
                        }}
                      />
                    </div>
                  ) : null}
                </CommentCard>
              ))}
            </ul>
          )}
          <div className="mbs-4 flex items-center gap-3">
            <Button variant="outline" disabled={page === 0 || busy} onClick={() => setPage((v) => v - 1)}>
              上一页
            </Button>
            <span>第 {page + 1} 页</span>
            <Button variant="outline" disabled={!data.hasMore || busy} onClick={() => setPage((v) => v + 1)}>
              下一页
            </Button>
          </div>
        </>
      )}
      <Button className="mbs-4" type="button" variant="outline" disabled={busy} onClick={() => setReload((v) => v + 1)}>
        重新加载评论与会员状态
      </Button>
    </section>
  )
}
