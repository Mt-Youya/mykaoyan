import { expect, it } from "vitest"

import { createDraft, parseDraft, presets, readDraft, writeDraft } from "./draft"

it("22408保留完整初试要求，只学习数学二和408，并能保存恢复", () => {
  const draft = createDraft(2027)
  draft.subjects = presets["22408"]
  draft.active = ["302", "408"]
  const values = new Map<string, string>([["private-notes", "keep"]])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
  writeDraft(storage, draft)
  expect(readDraft(storage)).toEqual(draft)
  expect(draft.subjects.map(({ code }) => code)).toEqual(["101", "204", "302", "408"])
  expect(values.get("private-notes")).toBe("keep")
  expect(parseDraft(JSON.stringify({ ...draft, active: ["301"] }))).toBeNull()
  expect(parseDraft("broken")).toBeNull()
})

it("11408与专业目标独立保存，拒绝重复科目、空学习范围和缺少学校的自命题科目", () => {
  const draft = {
    ...createDraft(2027),
    subjects: presets["11408"],
    active: ["201", "301"],
    target: { school: "示例大学", college: "", major: "085404 计算机技术", direction: "", mode: "全日制" },
  }
  expect(parseDraft(JSON.stringify(draft))).toEqual(draft)
  expect(draft.subjects.map(({ code }) => code)).toEqual(["101", "201", "301", "408"])
  expect(parseDraft(JSON.stringify({ ...draft, active: [] }))).toBeNull()
  expect(parseDraft(JSON.stringify({ ...draft, active: ["201", "201"] }))).toBeNull()
  expect(parseDraft(JSON.stringify({ ...draft, subjects: [...draft.subjects, draft.subjects[0]] }))).toBeNull()
  expect(
    parseDraft(
      JSON.stringify({
        ...draft,
        target: { ...draft.target, school: "" },
        subjects: [{ code: "901", name: "专业基础" }],
        active: ["901"],
      }),
    ),
  ).toBeNull()
})

it("旧版草稿补齐目标与词汇偏好，存储异常不会被伪装成成功", () => {
  const old = { year: 2027, subjects: [{ code: "408", name: "计算机学科专业基础" }], active: ["408"] }
  expect(parseDraft(JSON.stringify(old))).toMatchObject({ ...old, target: { school: "" }, vocabulary: true })
  expect(() =>
    writeDraft(
      {
        setItem: () => {
          throw new Error("quota")
        },
      },
      { ...createDraft(2027), subjects: presets["22408"], active: ["302"] },
    ),
  ).toThrow("quota")
})

it("按统考代码兼容旧草稿中的括号名称，不让旧选择失效", () => {
  const old = {
    year: 2027,
    subjects: [
      { code: "204", name: "英语（二）" },
      { code: "302", name: "数学（二）" },
    ],
    active: ["302"],
  }
  expect(parseDraft(JSON.stringify(old))?.subjects).toEqual([
    { code: "204", name: "英语二" },
    { code: "302", name: "数学二" },
  ])
})

it("保存研招网条目来源，拒绝其他站点的链接", () => {
  const draft = {
    ...createDraft(2027),
    subjects: presets["22408"],
    active: ["302", "408"],
    target: { school: "示例大学", college: "示例学院", major: "085404 计算机技术", direction: "", mode: "全日制" },
    source: {
      url: "https://yz.chsi.com.cn/zsml/yjfxdetail?id=0123456789abcdef0123456789abcdef",
      checkedAt: "2026-10-27T08:00:00.000Z",
    },
  }
  expect(parseDraft(JSON.stringify(draft))).toEqual(draft)
  expect(parseDraft(JSON.stringify({ ...draft, source: { ...draft.source, url: "javascript:alert(1)" } }))).toBeNull()
  expect(
    parseDraft(
      JSON.stringify({
        ...draft,
        source: { ...draft.source, url: "https://example.com/zsml/yjfxdetail?id=0123456789abcdef0123456789abcdef" },
      }),
    ),
  ).toBeNull()
  expect(parseDraft(JSON.stringify({ ...draft, source: undefined }))?.source).toBeNull()
})
