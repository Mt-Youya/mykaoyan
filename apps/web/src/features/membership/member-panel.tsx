import { Button, Input, Field, FieldGroup, FieldLabel } from "@mykaoyan/ui"
import { useEffect, useState } from "react"
import { formatMembershipDate, membershipRequest } from "./api"
import type { MembershipStatus } from "./api"
export function MembershipSummary({ status }: { status: MembershipStatus }) {
  return (
    <>
      <p>
        {status.active && status.expiresAt
          ? `会员有效至 ${formatMembershipDate(status.expiresAt)}（上海时间）`
          : "当前不是会员"}
      </p>
      <details className="mbs-3">
        <summary className="cursor-pointer py-2">会员功能与开通说明</summary>
        <p className="text-muted-foreground">
          会员功能包括评论、投稿与评分，暂未开放的功能将在上线后提供。可联系管理员手动开通，或使用兑换码获得365天会员期；会员期可以叠加。
        </p>
      </details>
    </>
  )
}
export function MemberPanel() {
  const [status, setStatus] = useState<MembershipStatus | null>(null),
    [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void membershipRequest<MembershipStatus>("membership")
      .then((v) => {
        if (active) setStatus(v)
      })
      .catch((error) => {
        if (active) setMessage(error.message)
      })
    return () => {
      active = false
    }
  }, [])
  async function redeem(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      const period = await membershipRequest<{ endsAt: string }>("membership/redeem", { code })
      setCode("")
      setStatus({ active: true, expiresAt: period.endsAt })
      setMessage("兑换成功，会员期已更新。")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "兑换失败")
    } finally {
      setBusy(false)
    }
  }
  return (
    <section id="membership" className="mbs-8 border-t border-border pbs-6" aria-labelledby="member-title">
      <h2 id="member-title" className="text-lg">
        会员期
      </h2>
      {status ? (
        <MembershipSummary status={status} />
      ) : (
        <p>{message ? "会员期暂不可用，请刷新重试。" : "正在读取会员期…"}</p>
      )}
      <form onSubmit={redeem} className="mbs-4 flex flex-col gap-3">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="redeem-code">兑换码</FieldLabel>
            <Input
              id="redeem-code"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={32}
              required
            />
          </Field>
          <Button disabled={busy || !status} type="submit">
            {busy ? "正在兑换…" : "兑换并开通"}
          </Button>
        </FieldGroup>
      </form>
      {message ? (
        <p role="status" className="mbs-3">
          {message}
        </p>
      ) : null}
    </section>
  )
}
