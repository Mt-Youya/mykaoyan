import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { OwnPaperList, PaperAnswers, PaperDetail } from "./api"
import { CommunityPapersListPage } from "./community-papers-list-page"
import { MinePapersView } from "./mine-papers-page"
import { communityPaperAnswersHead, PaperAnswersPageView } from "./paper-answers-page"
import { emptyPaper, parseImportedPaper, toSubmitInput, validateDraft } from "./paper-form"
import { PaperPageView } from "./paper-page"

/** 全部使用虚构题目与虚构来源说明；仓库与测试不出现真实真题内容。 */
const validInput = {
  subjectCode: "302",
  year: 2099,
  title: "虚构用户试卷标题",
  sourceNote: "虚构来源：测试账号本人原创",
  rightsConfirmed: true,
  questions: [
    {
      number: 1,
      type: "单选",
      score: 2,
      topics: ["虚构考点", "虚构考点二"],
      stemMarkdown: "虚构题面：请选择虚构答案。",
      options: [
        { label: "A", markdown: "虚构选项 A" },
        { label: "B", markdown: "虚构选项 B" },
      ],
      answerMarkdown: "虚构答案 A",
      analysisMarkdown: "虚构解析内容",
    },
    {
      number: 2,
      type: "简答",
      score: null,
      topics: [],
      stemMarkdown: "虚构第二题题面",
      options: null,
      answerMarkdown: "虚构答案二",
      analysisMarkdown: null,
    },
  ],
}

const detail: PaperDetail = {
  slug: "u-0123456789ab",
  title: "虚构用户试卷标题",
  year: 2099,
  subjectCode: "302",
  sourceNote: "虚构来源",
  origin: "user",
  questionCount: 1,
  questions: [
    {
      number: 1,
      type: "单选",
      score: 2,
      topics: ["虚构考点"],
      stemMarkdown: "虚构题面：请选择虚构答案。",
      options: [
        { label: "A", markdown: "虚构选项 A" },
        { label: "B", markdown: "虚构选项 B" },
      ],
    },
  ],
}

const answers: PaperAnswers = {
  slug: "u-0123456789ab",
  title: "虚构用户试卷标题",
  year: 2099,
  origin: "user",
  questions: [{ ...detail.questions[0]!, answerMarkdown: "虚构答案 A", analysisMarkdown: "虚构解析内容" }],
}

const mineList: OwnPaperList = {
  enabled: true,
  hasMore: false,
  items: [
    {
      slug: "u-pending",
      title: "虚构待审试卷",
      year: 2099,
      subjectCode: "302",
      sourceNote: null,
      origin: "user",
      questionCount: 1,
      reviewStatus: "pending",
      listed: false,
      reviewReason: null,
      createdAt: "2026-10-31T00:00:00.000Z",
      reviewedAt: null,
    },
    {
      slug: "u-rejected",
      title: "虚构驳回试卷",
      year: 2099,
      subjectCode: "302",
      sourceNote: null,
      origin: "user",
      questionCount: 2,
      reviewStatus: "rejected",
      listed: false,
      reviewReason: "虚构驳回原因：来源说明不足",
      createdAt: "2026-10-30T00:00:00.000Z",
      reviewedAt: "2026-10-31T00:00:00.000Z",
    },
    {
      slug: "u-approved",
      title: "虚构已上架试卷",
      year: 2099,
      subjectCode: "408",
      sourceNote: null,
      origin: "user",
      questionCount: 3,
      reviewStatus: "approved",
      listed: true,
      reviewReason: null,
      createdAt: "2026-10-29T00:00:00.000Z",
      reviewedAt: "2026-10-30T00:00:00.000Z",
    },
  ],
}

function draftFromInput(input = validInput) {
  const imported = parseImportedPaper(JSON.stringify(input))
  if (!imported.ok) throw new Error(imported.message)
  return imported.draft
}

describe("用户试卷表单校验与 JSON 导入", () => {
  it("空表单、题号重复与空选项都给出带题号的中文提示", () => {
    const empty = validateDraft(emptyPaper())
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.message).toContain("标题")

    const missingStem = draftFromInput()
    missingStem.questions[0]!.stemMarkdown = ""
    const question = validateDraft(missingStem)
    expect(question.ok).toBe(false)
    if (!question.ok) expect(question.message).toContain("第 1 题")

    const unordered = draftFromInput()
    unordered.questions[1]!.number = "1"
    const repeated = validateDraft(unordered)
    expect(repeated.ok).toBe(false)
    if (!repeated.ok) expect(repeated.message).toContain("题号")

    const emptyOption = draftFromInput()
    emptyOption.questions[0]!.options = ["", "虚构选项 B"]
    const missing = validateDraft(emptyOption)
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.message).toContain("选项")
  })

  it("合法草稿转换为提交契约：选项补 A–H 标签、空解析为 null、考点按顿号拆分", () => {
    const result = validateDraft(draftFromInput())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.questions[0]).toMatchObject({
      number: 1,
      type: "单选",
      score: 2,
      topics: ["虚构考点", "虚构考点二"],
      options: [
        { label: "A", markdown: "虚构选项 A" },
        { label: "B", markdown: "虚构选项 B" },
      ],
      analysisMarkdown: "虚构解析内容",
    })
    expect(result.input.questions[1]).toMatchObject({ score: null, options: null, analysisMarkdown: null })
    expect(toSubmitInput(draftFromInput()).rightsConfirmed).toBe(true)
  })

  it("单题不超限但整卷超过 512 KiB 时拒绝提交", () => {
    const draft = draftFromInput()
    draft.questions = Array.from({ length: 6 }, (_, index) => ({
      ...draft.questions[1]!,
      number: String(index + 1),
      stemMarkdown: "x".repeat(50_000),
      answerMarkdown: "y".repeat(50_000),
    }))
    const result = validateDraft(draft)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("524288")
  })

  it("JSON 导入：合法文件回填草稿，非法 JSON 与缺权利声明报错", () => {
    const imported = parseImportedPaper(JSON.stringify(validInput))
    expect(imported.ok).toBe(true)
    if (imported.ok) {
      expect(imported.draft.title).toBe(validInput.title)
      expect(imported.draft.questions).toHaveLength(2)
      expect(imported.draft.questions[0]?.options).toEqual(["虚构选项 A", "虚构选项 B"])
      expect(imported.draft.rightsConfirmed).toBe(true)
    }
    expect(parseImportedPaper("{not json")).toMatchObject({ ok: false })
    const unconfirmed = parseImportedPaper(JSON.stringify({ ...validInput, rightsConfirmed: false }))
    expect(unconfirmed.ok).toBe(false)
    if (!unconfirmed.ok) expect(unconfirmed.message).toContain("权利声明")
    const extraKey = parseImportedPaper(JSON.stringify({ ...validInput, slug: "should-not-be-accepted" }))
    expect(extraKey.ok).toBe(false)
  })
})

describe("用户试卷题面页与答案页的访问状态", () => {
  it("题面页按加载/成功/不存在状态渲染，题面页不出现答案", () => {
    expect(renderToStaticMarkup(<PaperPageView state={{ status: "loading" }} />)).toContain("正在加载")
    expect(renderToStaticMarkup(<PaperPageView state={{ status: "not-found" }} />)).toContain("尚未上架")
    const html = renderToStaticMarkup(<PaperPageView state={{ status: "ok", data: detail }} community />)
    expect(html).toContain("虚构题面")
    expect(html).toContain("虚构选项 A")
    expect(html).toContain("/community/papers/u-0123456789ab/answers")
    expect(html).toContain("用户投稿")
    expect(html).toContain("正在读取评论")
    expect(html).not.toContain("虚构答案 A")
  })

  it("答案页四态：未登录、非会员、正常、不存在", () => {
    expect(renderToStaticMarkup(<PaperAnswersPageView state={{ status: "unauthorized" }} community />)).toContain(
      "需要登录",
    )
    const forbidden = renderToStaticMarkup(<PaperAnswersPageView state={{ status: "forbidden" }} community />)
    expect(forbidden).toContain("有效会员")
    expect(forbidden).toContain("/login#membership")
    const ok = renderToStaticMarkup(<PaperAnswersPageView state={{ status: "ok", data: answers }} community />)
    expect(ok).toContain("虚构答案 A")
    expect(ok).toContain("虚构解析内容")
    expect(ok).toContain("用户投稿")
    expect(renderToStaticMarkup(<PaperAnswersPageView state={{ status: "not-found" }} community />)).toContain("不存在")
  })

  it("答案页声明 noindex，真题页面行为不变", () => {
    expect(JSON.stringify(communityPaperAnswersHead)).toContain("noindex")
    const examsDetail = renderToStaticMarkup(
      <PaperPageView state={{ status: "ok", data: { ...detail, origin: "admin" } }} />,
    )
    expect(examsDetail).toContain("/exams/u-0123456789ab/answers")
    expect(examsDetail).not.toContain("/community/papers")
    // 真题与用户试卷共用题面 View，评论区同样挂载。
    expect(examsDetail).toContain("正在读取评论")
  })
})

describe("我的试卷与社区列表入口", () => {
  it("我的试卷展示待审、驳回原因与已通过上架状态", () => {
    const html = renderToStaticMarkup(<MinePapersView state={{ status: "ok", data: mineList }} />)
    expect(html).toContain("虚构待审试卷")
    expect(html).toContain("待审核")
    expect(html).toContain("虚构驳回原因：来源说明不足")
    expect(html).toContain("已通过并上架")
    expect(html).toContain("/community/papers/u-pending/answers")
    expect(html).toContain("/community/papers/u-approved")
    expect(renderToStaticMarkup(<MinePapersView state={{ status: "unauthorized" }} />)).toContain("需要先登录")
  })

  it("社区列表页只列用户投稿并提供提交与我的试卷入口", () => {
    const html = renderToStaticMarkup(<CommunityPapersListPage />)
    expect(html).toContain("用户投稿试卷")
    expect(html).toContain("/community/papers/new")
    expect(html).toContain("/community/papers/mine")
    expect(html).toContain("/exams")
  })
})
