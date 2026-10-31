import { useEffect, useState } from "react"

import { Button, Field, FieldGroup, FieldLabel, Textarea } from "@mykaoyan/ui"

import { MembershipAction, MembershipHelp } from "../membership"
import type { MembershipAccess } from "../membership"
import { commentRequest, CommentRequestError } from "./api"
import type { CommentItem, CommentList } from "./api"
import { CommentCard } from "./comments-panel"
export type PaperCommentViewer = { signedIn: boolean; member: boolean; owner: boolean }
export type PaperCommentList = CommentList & { viewer: PaperCommentViewer }
export type PaperCommentAccess = { access: MembershipAccess; canComment: boolean; owner: boolean }
/**
 * 试卷评论三态：访客需登录；非会员且非上传者需有效会员；
 * 有效会员与试卷上传者本人（`owner`）可评论，上传者本人免会员。
 */
export function paperCommentAccess(viewer: PaperCommentViewer | null): PaperCommentAccess {
  if (!viewer?.signedIn) return { access: "guest", canComment: false, owner: false }
  if (viewer.owner) return { access: "member", canComment: true, owner: true }
  if (viewer.member) return { access: "member", canComment: true, owner: false }
  return { access: "nonmember", canComment: false, owner: false }
}
/** 试卷评论区的数据地址：真题与用户试卷共用同一接口；省略页码时用于发表。 */
export function paperCommentsPath(slug: string, page?: number): string {
  const path = `papers/${encodeURIComponent(slug)}/comments`
  return page === undefined ? path : `${path}?page=${page}`
}
export function PaperCommentsPanel({ slug }: { slug: string }) {
  const [data, setData] = useState<PaperCommentList | null>(null),
    [page, setPage] = useState(0),
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
    void commentRequest<PaperCommentList>(paperCommentsPath(slug, page))
      .then((result) => {
        if (active) setData(result)
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "评论读取失败")
      })
    return () => {
      active = false
    }
  }, [slug, page, reload])
  const current = paperCommentAccess(data?.viewer ?? null)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      await commentRequest(paperCommentsPath(slug), "POST", {
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
      if (error instanceof CommentRequestError && (error.status === 401 || error.status === 403)) {
        setForm(false)
        // 不重新拉取（会清掉刚设置的错误提示），按失败类型就地更新入口状态。
        setData((previous) =>
          !previous
            ? previous
            : {
                ...previous,
                viewer:
                  error.status === 401
                    ? { signedIn: false, member: false, owner: false }
                    : { ...previous.viewer, member: false },
              },
        )
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="mt-10 border-t border-border pt-6" aria-labelledby="paper-comments-title">
      <h2 id="paper-comments-title" className="text-[1.2rem]">
        评论
      </h2>
      {!data ? (
        <p className="mt-4 text-muted-foreground">{message || "正在读取评论…"}</p>
      ) : !data.enabled ? (
        <p className="mt-4 text-muted-foreground">评论暂未开放。</p>
      ) : (
        <>
          <div className="mt-4">
            <MembershipAction
              disabled={busy}
              access={current.access}
              label="发表评论"
              onAllowed={() => {
                setForm(true)
                setReply(null)
              }}
            />
          </div>
          {current.owner ? (
            <p className="mt-3 text-[0.95rem] opacity-[0.75]">你是本卷上传者，在此评论与回复免会员。</p>
          ) : null}
          {message ? (
            <div className="mt-3">
              <p role="alert">{message}</p>
              {current.access === "guest" || current.access === "nonmember" ? (
                <MembershipHelp guest={current.access === "guest"} />
              ) : null}
            </div>
          ) : null}
          {form ? (
            <form className="mt-4" onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="paper-comment-body">{reply ? `回复 ${reply.author}` : "评论内容"}</FieldLabel>
                  <Textarea
                    id="paper-comment-body"
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
            <p className="mt-4 text-muted-foreground">还没有评论。</p>
          ) : (
            <ul className="mt-4">
              {data.items.map((item) => (
                <CommentCard key={item.id} item={item}>
                  {!item.parentId && !item.deleted ? (
                    <div className="mt-3">
                      <MembershipAction
                        disabled={busy}
                        access={current.access}
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
          <div className="mt-4 flex items-center gap-3">
            <Button variant="outline" disabled={page === 0 || busy} onClick={() => setPage((value) => value - 1)}>
              上一页
            </Button>
            <span>第 {page + 1} 页</span>
            <Button variant="outline" disabled={!data.hasMore || busy} onClick={() => setPage((value) => value + 1)}>
              下一页
            </Button>
          </div>
        </>
      )}
      <Button
        className="mt-4"
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => setReload((value) => value + 1)}
      >
        重新加载评论
      </Button>
    </section>
  )
}
