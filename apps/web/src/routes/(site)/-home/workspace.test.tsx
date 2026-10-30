import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"

import { createDraft, presets } from "../../../features/profile"
import { ProfileForm } from "./profile-form"
import { toSubjects } from "./target-lookup"
import { StudyWorkspace } from "./workspace"

it("默认只展示当前学习科目的目录，隐藏英语时不展示背单词工具", () => {
  const draft = { ...createDraft(2027), subjects: presets["22408"], active: ["302", "408"] }
  const html = renderToStaticMarkup(<StudyWorkspace draft={draft} onEdit={() => {}} onBrowse={() => {}} />)
  expect(html).toContain('aria-label="数学二课程"')
  expect(html).toContain('aria-label="计算机学科专业基础讲义"')
  expect(html).not.toContain('aria-label="英语二课程"')
  expect(html).not.toContain('aria-label="数学一课程"')
  expect(html).not.toContain("背单词")
  expect(html).not.toContain('href="/vocabulary"')
  expect(html).toContain("尚未同步到账号")
  const english = renderToStaticMarkup(
    <StudyWorkspace draft={{ ...draft, active: ["204"] }} onEdit={() => {}} onBrowse={() => {}} />,
  )
  expect(english).toContain("背单词")
  expect(english).toContain('href="/vocabulary"')
  expect(english).not.toContain('aria-label="数学二课程"')
})

it("未定目标也能开始，表单明确标示本机草稿和招生年度", () => {
  const html = renderToStaticMarkup(<ProfileForm initial={null} onSave={() => true} onCancel={() => {}} />)
  expect(html).toContain("报考目标（均可暂不填写）")
  expect(html).toContain("本机草稿")
  expect(html).toContain("招生年度")
  expect(html).not.toContain("示例大学")
})

it("报考目标可以从研招网目录查找，手动填写仍然保留", () => {
  const html = renderToStaticMarkup(<ProfileForm initial={null} onSave={() => true} onCancel={() => {}} />)
  expect(html).toMatch(/从研招网 \d{4} 招生目录查找/)
  expect(html).toContain("查找学校")
  expect(html).toContain("招生专业（代码与名称）")
  expect(html).toContain("非官方开放 API")
})

it("目录科目组按代码换成站内统考名称，其他科目保留正式名称，缺名称时不带入", () => {
  expect(
    toSubjects({
      subjects: [
        { code: "101", name: "思想政治理论" },
        { code: "203", name: "日语" },
        { code: "302", name: "数学（二）" },
        { code: "830", name: "示例专业基础" },
      ],
    }),
  ).toEqual([
    { code: "101", name: "思想政治理论" },
    { code: "203", name: "日语" },
    { code: "302", name: "数学二" },
    { code: "830", name: "示例专业基础" },
  ])
  expect(toSubjects({ subjects: [{ code: "861", name: null }] })).toBeNull()
})
