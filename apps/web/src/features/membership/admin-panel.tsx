import { useEffect, useState } from "react"

import { Button, Field, FieldGroup, FieldLabel, Input } from "@mykaoyan/ui"

import { formatMembershipDate, membershipRequest } from "./api"
import type { CodeList } from "./api"
export function AdminMembershipPanel() {
  const [phone, setPhone] = useState(""),
    [reason, setReason] = useState(""),
    [count, setCount] = useState("10"),
    [codes, setCodes] = useState<{ id: string; code: string }[]>([]),
    [list, setList] = useState<CodeList | null>(null),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("")
  useEffect(() => {
    let active = true
    void membershipRequest<CodeList>(`admin/membership/codes?page=${page}`)
      .then((v) => {
        if (active) setList(v)
      })
      .catch((error) => {
        if (active) setMessage(error.message)
      })
    return () => {
      active = false
    }
  }, [page])
  async function grant(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      const account = await membershipRequest<{ id: string }>("admin/membership/accounts", { phone })
      const period = await membershipRequest<{ endsAt: string }>("admin/membership/grants", {
        accountId: account.id,
        reason,
      })
      setReason("")
      setMessage(`已开通，到期时间 ${formatMembershipDate(period.endsAt)}（上海时间）。`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "开通失败")
    } finally {
      setBusy(false)
    }
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    setCodes([])
    try {
      const result = await membershipRequest<{ codes: { id: string; code: string }[] }>("admin/membership/codes", {
        count: Number(count),
      })
      setCodes(result.codes)
      setPage(0)
      setList(await membershipRequest<CodeList>("admin/membership/codes?page=0"))
      setMessage("兑换码已生成，请立即保存，下次只能查看末四位。")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败")
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="mbs-10 border-t border-border pbs-6" aria-labelledby="admin-membership">
      <h2 id="admin-membership" className="text-xl">
        会员期与兑换码
      </h2>
      <div className="mbs-4 flex flex-col gap-8">
        <form onSubmit={grant} className="flex max-w-lg flex-col gap-3">
          <FieldGroup>
            <h3>手动开通一个会员期（365天）</h3>
            <Field>
              <FieldLabel htmlFor="member-account">待开通账号的手机号</FieldLabel>
              <Input
                id="member-account"
                type="tel"
                maxLength={11}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="member-reason">开通原因（必填）</FieldLabel>
              <Input
                id="member-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                required
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? "处理中…" : "开通并保留原因"}
            </Button>
          </FieldGroup>
        </form>
        <form onSubmit={generate} className="flex max-w-lg flex-col gap-3">
          <FieldGroup>
            <h3>批量生成兑换码</h3>
            <Field>
              <FieldLabel htmlFor="code-count">数量（1至100）</FieldLabel>
              <Input
                id="code-count"
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" disabled={busy || codes.length > 0}>
              生成兑换码
            </Button>
          </FieldGroup>
        </form>
      </div>
      {message ? (
        <p className="mbs-4" role="status">
          {message}
        </p>
      ) : null}
      {codes.length ? (
        <div className="mbs-4">
          <p>兑换码编号与完整兑换码仅本次显示，请保存：</p>
          <pre className="overflow-x-auto border border-border p-3 break-all whitespace-pre-wrap">
            {codes.map((item) => `${item.id}\t${item.code}`).join("\n")}
          </pre>
          <Button variant="outline" onClick={() => setCodes([])}>
            已保存，隐藏完整兑换码
          </Button>
        </div>
      ) : null}
      <h3 className="mbs-6">兑换记录</h3>
      {list ? (
        <>
          <ul className="mbs-3 flex flex-col gap-3">
            {list.items.map((code) => (
              <li key={code.id} className="border-b border-border pbe-3">
                <p className="text-sm break-all">编号：{code.id}</p>
                <p>
                  末四位 {code.last4} ·{" "}
                  {code.redeemedAt ? `已兑换 · ${formatMembershipDate(code.redeemedAt)}` : "未兑换"}
                </p>
                {code.redeemedAt ? (
                  <p className="text-sm break-all text-muted-foreground">兑换账号：{code.redeemedBy ?? "账号已删除"}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {!list.items.length ? <p>还没有兑换码。</p> : null}
          <div className="mbs-4 flex items-center gap-3">
            <Button variant="outline" disabled={page === 0 || busy} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <span>第 {page + 1} 页</span>
            <Button variant="outline" disabled={!list.hasMore || busy} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        </>
      ) : (
        <p>{message ? "兑换记录暂不可用，请刷新重试。" : "正在读取兑换记录…"}</p>
      )}
    </section>
  )
}
