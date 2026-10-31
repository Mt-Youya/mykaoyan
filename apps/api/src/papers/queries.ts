import { asc, count, eq, inArray } from "drizzle-orm"

import { paperQuestions, papers } from "@mykaoyan/db"

import type { Database } from "../database"
import type { PaperRow, PaperSummary, QuestionAnswerRow, QuestionRow } from "./shared"

/** 试卷与题目在 DTO 里需要的列；读取时统一走这里，避免各处字段漂移。 */
export const paperColumns = {
  id: papers.id,
  slug: papers.slug,
  title: papers.title,
  year: papers.year,
  subjectCode: papers.subjectCode,
  sourceNote: papers.sourceNote,
  origin: papers.origin,
  reviewStatus: papers.reviewStatus,
  listed: papers.listed,
  ownerAccountId: papers.ownerAccountId,
  reviewReason: papers.reviewReason,
  reviewedAt: papers.reviewedAt,
  rightsConfirmedAt: papers.rightsConfirmedAt,
  createdAt: papers.createdAt,
}

const questionColumns = {
  number: paperQuestions.number,
  type: paperQuestions.type,
  score: paperQuestions.score,
  topics: paperQuestions.topics,
  stemMarkdown: paperQuestions.stemMarkdown,
  options: paperQuestions.options,
}

const answerColumns = {
  ...questionColumns,
  answerMarkdown: paperQuestions.answerMarkdown,
  analysisMarkdown: paperQuestions.analysisMarkdown,
}

/** 按 slug 读一行试卷；不在这里判断可见性。 */
export async function loadPaper(db: Database, slug: string): Promise<PaperRow | undefined> {
  const [row] = await db.select(paperColumns).from(papers).where(eq(papers.slug, slug)).limit(1)
  return row
}

/** 题目题面（公开视图，不含答案）。 */
export async function loadQuestions(db: Database, paperId: string): Promise<QuestionRow[]> {
  return db
    .select(questionColumns)
    .from(paperQuestions)
    .where(eq(paperQuestions.paperId, paperId))
    .orderBy(asc(paperQuestions.number))
}

/** 题目题面与答案（答案页与管理员审核预览）。 */
export async function loadQuestionAnswers(db: Database, paperId: string): Promise<QuestionAnswerRow[]> {
  return db
    .select(answerColumns)
    .from(paperQuestions)
    .where(eq(paperQuestions.paperId, paperId))
    .orderBy(asc(paperQuestions.number))
}

/** 一批试卷的题数，避免逐条查询。 */
export async function questionCounts(db: Database, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map()
  const rows = await db
    .select({ paperId: paperQuestions.paperId, total: count() })
    .from(paperQuestions)
    .where(inArray(paperQuestions.paperId, ids))
    .groupBy(paperQuestions.paperId)
  return new Map(rows.map((row) => [row.paperId, Number(row.total)]))
}

/** 试卷摘要：公开列表、我的试卷与审核列表共用同一组基础字段。 */
export function paperSummary(row: PaperRow, questionCount: number): PaperSummary {
  return {
    slug: row.slug,
    title: row.title,
    year: row.year,
    subjectCode: row.subjectCode,
    sourceNote: row.sourceNote,
    origin: row.origin === "user" ? "user" : "admin",
    questionCount,
  }
}

export function publicQuestions(rows: QuestionRow[]) {
  return rows.map((question) => ({
    number: question.number,
    type: question.type,
    score: question.score,
    topics: question.topics,
    stemMarkdown: question.stemMarkdown,
    options: Array.isArray(question.options) ? question.options : null,
  }))
}

export function answerQuestions(rows: QuestionAnswerRow[]) {
  return rows.map((question) => ({
    number: question.number,
    type: question.type,
    score: question.score,
    topics: question.topics,
    stemMarkdown: question.stemMarkdown,
    options: Array.isArray(question.options) ? question.options : null,
    answerMarkdown: question.answerMarkdown,
    analysisMarkdown: question.analysisMarkdown,
  }))
}
