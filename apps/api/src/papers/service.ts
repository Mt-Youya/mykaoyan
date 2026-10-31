import { ForbiddenException, Inject, Injectable } from "@nestjs/common"
import { and, asc, count, desc, eq, inArray } from "drizzle-orm"

import { paperQuestions, papers } from "@mykaoyan/db"

import { DatabaseService } from "../database"
import type { Database } from "../database"
import { MembershipService } from "../membership"

export type PaperOption = { label: string; markdown: string }
export type PaperQuestionPublic = {
  number: number
  type: string
  score: number | null
  topics: string[] | null
  stemMarkdown: string
  options: PaperOption[] | null
}
export type PaperSummary = {
  slug: string
  title: string
  year: number
  subjectCode: string
  sourceNote: string | null
  questionCount: number
}
export type PaperDetail = PaperSummary & { questions: PaperQuestionPublic[] }
export type PaperAnswerQuestion = PaperQuestionPublic & {
  answerMarkdown: string
  analysisMarkdown: string | null
}
export type PaperAnswers = { slug: string; title: string; year: number; questions: PaperAnswerQuestion[] }

function options(value: unknown): PaperOption[] | null {
  return Array.isArray(value) ? (value as PaperOption[]) : null
}

/** 已上架试卷的只读查询：公开题面不含答案，答案只在登录后的答案接口返回。 */
@Injectable()
export class PapersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MembershipService) private readonly membership: MembershipService,
  ) {}

  private get db(): Database {
    return this.database.db
  }

  async list(subjectCode: string): Promise<PaperSummary[]> {
    const rows = await this.db
      .select({
        id: papers.id,
        slug: papers.slug,
        title: papers.title,
        year: papers.year,
        subjectCode: papers.subjectCode,
        sourceNote: papers.sourceNote,
      })
      .from(papers)
      .where(and(eq(papers.listed, true), eq(papers.subjectCode, subjectCode)))
      .orderBy(desc(papers.year), asc(papers.position))
    if (!rows.length) return []
    const counts = await this.db
      .select({ paperId: paperQuestions.paperId, total: count() })
      .from(paperQuestions)
      .where(
        inArray(
          paperQuestions.paperId,
          rows.map((row) => row.id),
        ),
      )
      .groupBy(paperQuestions.paperId)
    const total = new Map(counts.map((row) => [row.paperId, Number(row.total)]))
    return rows.map(({ id, ...row }) => ({ ...row, questionCount: total.get(id) ?? 0 }))
  }

  async get(slug: string): Promise<PaperDetail | undefined> {
    const [paper] = await this.db
      .select({
        id: papers.id,
        slug: papers.slug,
        title: papers.title,
        year: papers.year,
        subjectCode: papers.subjectCode,
        sourceNote: papers.sourceNote,
      })
      .from(papers)
      .where(and(eq(papers.listed, true), eq(papers.slug, slug)))
      .limit(1)
    if (!paper) return undefined
    const questions = await this.db
      .select({
        number: paperQuestions.number,
        type: paperQuestions.type,
        score: paperQuestions.score,
        topics: paperQuestions.topics,
        stemMarkdown: paperQuestions.stemMarkdown,
        options: paperQuestions.options,
      })
      .from(paperQuestions)
      .where(eq(paperQuestions.paperId, paper.id))
      .orderBy(asc(paperQuestions.number))
    return {
      slug: paper.slug,
      title: paper.title,
      year: paper.year,
      subjectCode: paper.subjectCode,
      sourceNote: paper.sourceNote,
      questionCount: questions.length,
      questions: questions.map((question) => ({ ...question, options: options(question.options) })),
    }
  }

  /**
   * 登录后的答案接口：只对已上架试卷返回；管理员与试卷上传者本人可看，
   * 其他账号需要有效会员。调用方负责会话校验。
   */
  async answersFor(actor: { id: string; role: string }, slug: string): Promise<PaperAnswers | undefined> {
    const [paper] = await this.db
      .select({
        id: papers.id,
        slug: papers.slug,
        title: papers.title,
        year: papers.year,
        ownerAccountId: papers.ownerAccountId,
      })
      .from(papers)
      .where(and(eq(papers.listed, true), eq(papers.slug, slug)))
      .limit(1)
    if (!paper) return undefined
    if (actor.role !== "admin" && actor.id !== paper.ownerAccountId) {
      if (!(await this.membership.status(actor.id)).active)
        throw new ForbiddenException("查看答案需要有效会员；试卷上传者本人可查看自己上传试卷的答案")
    }
    const questions = await this.db
      .select({
        number: paperQuestions.number,
        type: paperQuestions.type,
        score: paperQuestions.score,
        topics: paperQuestions.topics,
        stemMarkdown: paperQuestions.stemMarkdown,
        options: paperQuestions.options,
        answerMarkdown: paperQuestions.answerMarkdown,
        analysisMarkdown: paperQuestions.analysisMarkdown,
      })
      .from(paperQuestions)
      .where(eq(paperQuestions.paperId, paper.id))
      .orderBy(asc(paperQuestions.number))
    return {
      slug: paper.slug,
      title: paper.title,
      year: paper.year,
      questions: questions.map((question) => ({ ...question, options: options(question.options) })),
    }
  }
}
