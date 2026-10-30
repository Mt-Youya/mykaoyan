import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { MembershipSummary } from "./member-panel"
describe("账号会员展示", () => {
  it("非会员能展开开通说明，不显示虚假到期时间", () => {
    const html = renderToStaticMarkup(<MembershipSummary status={{ active: false, expiresAt: null }} />)
    expect(html).toContain("当前不是会员")
    expect(html).toContain("<details")
    expect(html).toContain("会员功能与开通说明")
    expect(html).toContain("兑换码")
    expect(html).not.toContain("会员有效至")
  })
  it("按上海时间展示到期日", () => {
    const html = renderToStaticMarkup(
      <MembershipSummary status={{ active: true, expiresAt: "2030-01-01T18:00:00Z" }} />,
    )
    expect(html).toContain("2030年1月2日")
    expect(html).toContain("02:00")
    expect(html).toContain("上海时间")
  })
})
