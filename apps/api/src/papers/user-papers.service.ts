import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { and, desc, eq } from "drizzle-orm"

import { submitPaperSchema } from "@mykaoyan/core"
import { paperQuestions, papers } from "@mykaoyan/db"

import { CONFIG } from "../config"
import { DatabaseService } from "../database"
import type { Database } from "../database"
import type { Environment } from "../environment"
import { answerQuestions, loadQuestionAnswers, paperColumns, paperSummary, questionCounts } from "./queries"
import { iso, newPaperSlug, PAGE_SIZE, paperContentHash, parsePage, reviewStatusOf } from "./shared"
import type { Actor, PaperReviewStatus, PaperRow } from "./shared"

/** 本人试卷列表项：审核状态、驳回原因与时间只在这里（本人/管理员）出现。 */
export type OwnPaper = {
  slug: string
  title: string
  year: number
  subjectCode: string
  sourceNote: string | null
  origin: "user"
  questionCount: number
  reviewStatus: PaperReviewStatus
  listed: boolean
  reviewReason: string | null
  createdAt: string
  reviewedAt: string | null
}

/** 用户试卷提交结果：`slug`、审核状态与题数。 */
export type SubmittedPaper = {
  slug: string
  origin: "user"
  reviewStatus: "pending"
  listed: false
  questionCount: number
}

/**
 * 用户试卷的提交与本人视图。
 *
 * 提交只要求登录（不要求会员），社区开放时可用；写入即 `pending`、默认下架，
 * 只能由管理员审核与上架。提交后不可编辑、不可撤回；被驳回后重新提交会生成新记录。
 */
@Injectable()
export class UserPapersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CONFIG) private readonly config: Environment,
  ) {}

  private get db(): Database {
    return this.database.db
  }

  private open() {
    if (!this.config.COMMUNITY_ENABLED) throw new ForbiddenException("用户试卷提交尚未开放")
  }

  async submit(actor: Actor, body: unknown): Promise<SubmittedPaper> {
    this.open()
    const parsed = submitPaperSchema.safeParse(body ?? {})
    if (!parsed.success) throw new BadRequestException("试卷内容格式无效，请检查题号、选项、答案与整卷大小")
    const input = parsed.data
    const contentHash = paperContentHash(input)
    const slug = await this.db.transaction(async (tx) => {
      // 标识由服务端生成（`u-` + 12 位十六进制）；极低概率冲突时重试。
      let candidate = newPaperSlug()
      for (let attempt = 0; attempt < 5; attempt++) {
        const [existing] = await tx.select({ id: papers.id }).from(papers).where(eq(papers.slug, candidate)).limit(1)
        if (!existing) break
        if (attempt === 4) throw new Error("用户试卷标识生成失败")
        candidate = newPaperSlug()
      }
      const [saved] = await tx
        .insert(papers)
        .values({
          subjectCode: input.subjectCode,
          year: input.year,
          slug: candidate,
          title: input.title,
          sourceNote: input.sourceNote,
          origin: "user",
          reviewStatus: "pending",
          rightsConfirmedAt: new Date(),
          position: 0,
          listed: false,
          ownerAccountId: actor.id,
          contentHash,
          contentVersion: 1,
        })
        .returning({ id: papers.id, slug: papers.slug })
      if (!saved) throw new Error("试卷写入未返回记录")
      await tx.insert(paperQuestions).values(
        input.questions.map((question) => ({
          paperId: saved.id,
          number: question.number,
          type: question.type,
          score: question.score,
          topics: question.topics,
          stemMarkdown: question.stemMarkdown,
          options: question.options,
          answerMarkdown: question.answerMarkdown,
          analysisMarkdown: question.analysisMarkdown,
        })),
      )
      return saved.slug
    })
    return { slug, origin: "user", reviewStatus: "pending", listed: false, questionCount: input.questions.length }
  }

  private item(row: PaperRow, questionCount: number): OwnPaper {
    return {
      ...paperSummary(row, questionCount),
      origin: "user",
      reviewStatus: reviewStatusOf(row.reviewStatus),
      listed: row.listed,
      reviewReason: row.reviewReason,
      createdAt: new Date(row.createdAt).toISOString(),
      reviewedAt: iso(row.reviewedAt),
    }
  }

  async mine(actor: Actor, page: string | number) {
    const offset = parsePage(page) * PAGE_SIZE
    const rows = await this.db
      .select(paperColumns)
      .from(papers)
      .where(and(eq(papers.origin, "user"), eq(papers.ownerAccountId, actor.id)))
      .orderBy(desc(papers.createdAt), desc(papers.id))
      .limit(PAGE_SIZE + 1)
      .offset(offset)
    const visible = rows.slice(0, PAGE_SIZE)
    const counts = await questionCounts(
      this.db,
      visible.map((row) => row.id),
    )
    return {
      enabled: this.config.COMMUNITY_ENABLED,
      items: visible.map((row) => this.item(row, counts.get(row.id) ?? 0)),
      hasMore: rows.length > PAGE_SIZE,
    }
  }

  /** 本人试卷全文（含答案与解析），用于提交后预览与查看驳回原因；别人的试卷一律 404。 */
  async mineOne(actor: Actor, slug: string) {
    const [paper] = await this.db
      .select(paperColumns)
      .from(papers)
      .where(and(eq(papers.slug, slug), eq(papers.origin, "user"), eq(papers.ownerAccountId, actor.id)))
      .limit(1)
    if (!paper) throw new NotFoundException("试卷不存在")
    const questions = await loadQuestionAnswers(this.db, paper.id)
    return {
      ...this.item(paper, questions.length),
      rightsConfirmedAt: iso(paper.rightsConfirmedAt),
      questions: answerQuestions(questions),
    }
  }
}
