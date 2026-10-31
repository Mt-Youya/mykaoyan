/**
 * 用户试卷表单的纯函数：草稿 ↔ 提交契约的转换与浏览器端校验。
 *
 * 校验规则来自 `packages/core` 的 `submitPaperSchema`（与 API 同一份），
 * 这里只负责把表单草稿（全是字符串）转成契约输入并生成给人看的错误文案。
 */

import { PAPER_MAX_QUESTIONS, PAPER_QUESTION_TYPES, submitPaperSchema } from "@mykaoyan/core"
import type { SubmitPaper } from "@mykaoyan/core"

export const CHOICE_QUESTION_TYPES = new Set(["单选", "多选"])

export const PAPER_QUESTION_TYPE_OPTIONS = PAPER_QUESTION_TYPES

export type QuestionDraft = {
  number: string
  type: string
  score: string
  topics: string
  stemMarkdown: string
  options: string[]
  answerMarkdown: string
  analysisMarkdown: string
}

export type PaperDraft = {
  subjectCode: string
  year: string
  title: string
  sourceNote: string
  rightsConfirmed: boolean
  questions: QuestionDraft[]
}

export type DraftValidation = { ok: true; input: SubmitPaper } | { ok: false; message: string }

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

export function isChoiceQuestion(type: string): boolean {
  return CHOICE_QUESTION_TYPES.has(type)
}

export function emptyQuestion(number: number): QuestionDraft {
  return {
    number: String(number),
    type: "单选",
    score: "2",
    topics: "",
    stemMarkdown: "",
    options: ["", ""],
    answerMarkdown: "",
    analysisMarkdown: "",
  }
}

export function emptyPaper(): PaperDraft {
  return {
    subjectCode: "302",
    year: String(new Date().getFullYear()),
    title: "",
    sourceNote: "",
    rightsConfirmed: false,
    questions: [emptyQuestion(1)],
  }
}

/** 整卷题面 + 选项 + 答案 + 解析的 UTF-8 字节数，与服务端口径一致。 */
export function questionsBytes(questions: readonly QuestionDraft[]): number {
  return questions.reduce(
    (sum, question) =>
      sum +
      utf8Bytes(question.stemMarkdown) +
      utf8Bytes(question.answerMarkdown) +
      utf8Bytes(question.analysisMarkdown) +
      (isChoiceQuestion(question.type) ? question.options.reduce((n, option) => n + utf8Bytes(option), 0) : 0),
    0,
  )
}

export function toSubmitInput(draft: PaperDraft) {
  return {
    subjectCode: draft.subjectCode.trim(),
    year: Number(draft.year),
    title: draft.title.trim(),
    sourceNote: draft.sourceNote.trim(),
    rightsConfirmed: draft.rightsConfirmed,
    questions: draft.questions.map((question) => ({
      number: Number(question.number),
      type: question.type,
      score: question.score.trim() === "" ? null : Number(question.score),
      topics: question.topics
        .split(/[,，、\s]+/)
        .map((topic) => topic.trim())
        .filter(Boolean),
      stemMarkdown: question.stemMarkdown,
      options: isChoiceQuestion(question.type)
        ? question.options.map((markdown, optionIndex) => ({ label: "ABCDEFGH"[optionIndex] ?? "A", markdown }))
        : null,
      analysisMarkdown: question.analysisMarkdown.trim() === "" ? null : question.analysisMarkdown,
      answerMarkdown: question.answerMarkdown,
    })),
  }
}

const FIELD_MESSAGES: Record<string, string> = {
  subjectCode: "考试科目必须是三位数字代码",
  year: "年份需在 2000–2100 之间",
  title: "标题需要 1–200 字",
  sourceNote: "来源与权利说明需要 1–500 字，且不能为空",
  rightsConfirmed: "请勾选权利声明「本人拥有本卷内容或已获得授权」",
}

const QUESTION_FIELD_MESSAGES: Record<string, string> = {
  number: "题号必须唯一且严格升序",
  type: "题型不在允许范围内",
  score: "分值必须是 0–100 的整数",
  topics: "考点最多 20 个，每个不超过 50 字",
  stemMarkdown: "题面不能为空，且最多 50000 字符",
  options: "选择题需要 2–8 个非空选项，其他题型不能带选项",
  answerMarkdown: "答案不能为空，且最多 50000 字符",
  analysisMarkdown: "解析最多 50000 字符",
}

/** 把 zod 的第一个错误转成一句中文提示，带上题号。 */
export function issueMessage(issue: { path: PropertyKey[]; message: string }): string {
  const [field, index, child] = issue.path
  if (field === "questions" && typeof index === "number") {
    const detail = typeof child === "string" ? QUESTION_FIELD_MESSAGES[child] : undefined
    return `第 ${index + 1} 题：${detail ?? issue.message}`
  }
  if (field === "questions") return `整卷：${issue.message}`
  const label = typeof field === "string" ? (FIELD_MESSAGES[field] ?? issue.message) : "内容"
  return label
}

export function validateDraft(draft: PaperDraft): DraftValidation {
  if (!draft.questions.length) return { ok: false, message: "整卷至少需要 1 道题" }
  if (draft.questions.length > PAPER_MAX_QUESTIONS)
    return { ok: false, message: `一张试卷最多 ${PAPER_MAX_QUESTIONS} 道题` }
  const parsed = submitPaperSchema.safeParse(toSubmitInput(draft))
  if (parsed.success) return { ok: true, input: parsed.data }
  return { ok: false, message: issueMessage(parsed.error.issues[0]!) }
}

/** 导入符合 `SubmitPaper` 的 JSON 文件：先校验，再填进逐题表单。 */
export function parseImportedPaper(text: string): { ok: true; draft: PaperDraft } | { ok: false; message: string } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, message: "文件不是有效的 JSON" }
  }
  const parsed = submitPaperSchema.safeParse(value)
  if (!parsed.success) return { ok: false, message: `导入内容未通过校验：${issueMessage(parsed.error.issues[0]!)}` }
  const input = parsed.data
  return {
    ok: true,
    draft: {
      subjectCode: input.subjectCode,
      year: String(input.year),
      title: input.title,
      sourceNote: input.sourceNote,
      rightsConfirmed: true,
      questions: input.questions.map((question) => ({
        number: String(question.number),
        type: question.type,
        score: question.score === null ? "" : String(question.score),
        topics: (question.topics ?? []).join("、"),
        stemMarkdown: question.stemMarkdown,
        options: question.options?.map((option) => option.markdown) ?? ["", ""],
        answerMarkdown: question.answerMarkdown,
        analysisMarkdown: question.analysisMarkdown ?? "",
      })),
    },
  }
}
