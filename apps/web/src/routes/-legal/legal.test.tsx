import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { LegalLinks, PolicyChecks, PrivacyDocument, SupportDocument, TermsDocument } from "./documents"

describe("政策与投诉申诉公开入口", () => {
  it("访客无需登录就能找到全文、分类邮件入口及人工处理说明", () => {
    const footer = renderToStaticMarkup(<LegalLinks />)
    for (const route of ["/privacy", "/terms", "/support#report", "/support#appeal"])
      expect(footer).toContain(`href="${route}"`)
    const support = renderToStaticMarkup(<SupportDocument />)
    expect(support).toContain("feedback@mykaoyan.cn")
    expect(support).toContain("mailto:feedback@mykaoyan.cn?")
    expect(support).toContain('id="report"')
    expect(support).toContain('id="appeal"')
    expect(support).toContain("仍需在邮箱中发送")
    expect(support).not.toContain("已提交")
    expect(renderToStaticMarkup(<TermsDocument />)).toContain("社区目前关闭")
  })

  it("协议确认与出境同意独立且均不预选，告知覆盖实际地区及账号相关数据", () => {
    const html = renderToStaticMarkup(
      <PolicyChecks
        policy={{
          codeLength: 6,
          codeTtlSeconds: 300,
          cooldownSeconds: 60,
          privacyPolicyVersion: "2026-10-30-tokyo",
          termsVersion: "2026-10-30",
          databaseRegion: "日本东京",
          loginEnabled: true,
        }}
        agreed={false}
        consented={false}
        onAgreement={() => {}}
        onConsent={() => {}}
      />
    )
    expect(html.match(/type="checkbox"/g)).toHaveLength(2)
    expect(html).not.toContain("checked=")
    expect(html).toContain("日本东京")
    expect(html).toContain("学习数据")
    expect(html).toContain('href="/privacy#transfer"')
    expect(html).not.toContain("新加坡")
    const privacy = renderToStaticMarkup(<PrivacyDocument databaseRegion="日本东京" />)
    expect(privacy).toContain("Supabase Pte. Ltd.")
    expect(privacy).toContain("Cloudflare")
    expect(privacy).toContain("西欧（WEUR）")
  })
})
