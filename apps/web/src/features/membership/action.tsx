import { useState } from "react"

import { Button } from "@mykaoyan/ui"
export type MembershipAccess = "loading" | "guest" | "nonmember" | "member" | "error"
export function MembershipHelp({ guest = false }: { guest?: boolean }) {
  return (
    <div role="status" className="mbs-3 border-s-2 border-border ps-3">
      <p>{guest ? "请先登录，此功能需要有效会员。" : "此功能需要有效会员。"}</p>
      <p>可联系管理员手动开通，或使用兑换码开通365天会员期；会员期可以叠加。</p>
      <a className="underline underline-offset-4" href="/login#membership">
        {guest ? "登录并查看开通方式" : "查看会员期与兑换码入口"}
      </a>
    </div>
  )
}
export function MembershipAction({
  access,
  label,
  onAllowed,
  disabled = false,
}: {
  access: MembershipAccess
  label: string
  onAllowed: () => void
  disabled?: boolean
}) {
  const [help, setHelp] = useState(false)
  return (
    <>
      <Button
        className="min-h-11"
        variant="outline"
        type="button"
        disabled={disabled || access === "loading" || access === "error"}
        aria-expanded={access !== "member" ? help : undefined}
        onClick={() => (access === "member" ? onAllowed() : setHelp(true))}
      >
        {label}
      </Button>
      {help && access !== "member" ? <MembershipHelp guest={access === "guest"} /> : null}
    </>
  )
}
