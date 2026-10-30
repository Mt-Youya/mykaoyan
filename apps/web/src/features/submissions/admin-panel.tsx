import { useEffect, useState } from "react"
import { Button, Field, FieldGroup, FieldLabel, Input } from "@mykaoyan/ui"
import { submissionRequest } from "./api"
import type { AdminSubmission } from "./api"
import { SubmissionCard } from "./panel"
function ReviewControls({ item, onChange }: { item: AdminSubmission; onChange: () => void }) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("")
  async function act(path: string, body: unknown, method = "POST") {
    setBusy(true)
    setMessage("")
    try {
      await submissionRequest(`admin/submissions/${item.id}/${path}`, method, body)
      onChange()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "审核失败")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {item.status === "pending" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void act("review", { decision: "reject", reason })
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`reject-${item.id}`}>驳回原因（驳回时必填）</FieldLabel>
              <Input
                className="min-h-11"
                id={`reject-${item.id}`}
                value={reason}
                maxLength={500}
                required
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
              />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button
                className="min-h-11"
                type="button"
                disabled={busy}
                onClick={() => void act("review", { decision: "approve" })}
              >
                通过审核
              </Button>
              <Button className="min-h-11" type="submit" variant="outline" disabled={busy}>
                驳回投稿
              </Button>
            </div>
          </FieldGroup>
        </form>
      ) : null}
      {item.status === "approved" ? (
        <Button
          className="min-h-11 self-start"
          variant="outline"
          disabled={busy}
          onClick={() => void act("listing", { listed: !item.listed }, "PUT")}
        >
          {item.listed ? "下架投稿" : "上架投稿"}
        </Button>
      ) : null}
      {item.reason ? <p>驳回原因：{item.reason}</p> : null}
      {item.listingChange ? (
        <p className="text-sm text-muted-foreground">
          最近{item.listingChange.listed ? "上架" : "下架"}：管理员 {item.listingChange.actorId} ·{" "}
          {new Date(item.listingChange.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（上海时间）
        </p>
      ) : null}
      {item.reviewedAt ? (
        <p className="text-sm text-muted-foreground">
          审核时间：{new Date(item.reviewedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（上海时间）
        </p>
      ) : null}
      {item.deleted ? (
        <p>原文件已清理，审核记录保留。</p>
      ) : item.deleteMarked ? (
        <p>已标记清理，等待删除对象重试。</p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  )
}
export function AdminSubmissionsPanel() {
  const [data, setData] = useState<{ items: AdminSubmission[]; hasMore: boolean } | null>(null),
    [page, setPage] = useState(0),
    [reload, setReload] = useState(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    setData(null)
    setMessage("")
    void submissionRequest<{ items: AdminSubmission[]; hasMore: boolean }>(`admin/submissions?page=${page}`)
      .then((r) => {
        if (active) setData(r)
      })
      .catch((e) => {
        if (active) setMessage(e.message)
      })
    return () => {
      active = false
    }
  }, [page, reload])
  async function cleanup() {
    setBusy(true)
    setMessage("")
    try {
      const r = await submissionRequest<{ removed: number; pending: number }>("admin/submissions/cleanup", "POST", {})
      setMessage(`已清理${r.removed}个文件，${r.pending}个等待重试。`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "清理失败")
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-labelledby="admin-submissions" className="mbs-10 flex flex-col gap-4">
      <h2 id="admin-submissions" className="text-xl">
        投稿审核
      </h2>
      <p>通过审核后上架；社区关闭时仅记为已通过。驳回原文件满30天后自动清理，审核记录保留。</p>
      {message ? <p role="status">{message}</p> : null}
      {data ? (
        <>
          {data.items.length ? (
            <ul>
              {data.items.map((item) => (
                <SubmissionCard key={item.id} item={item} playable={!item.deleted && !item.deleteMarked}>
                  <ReviewControls item={item} onChange={() => setReload((n) => n + 1)} />
                </SubmissionCard>
              ))}
            </ul>
          ) : (
            <p>还没有投稿。</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button className="min-h-11" variant="outline" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
              上一页投稿审核
            </Button>
            <span>第 {page + 1} 页</span>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={!data.hasMore}
              onClick={() => setPage((n) => n + 1)}
            >
              下一页投稿审核
            </Button>
          </div>
          <Button variant="outline" className="min-h-11 self-start" disabled={busy} onClick={() => void cleanup()}>
            重试到期文件清理
          </Button>
        </>
      ) : (
        <p>{message ? "投稿管理暂不可用。" : "正在读取投稿…"}</p>
      )}
      <Button variant="outline" className="min-h-11 self-start" onClick={() => setReload((n) => n + 1)}>
        刷新投稿管理
      </Button>
    </section>
  )
}
