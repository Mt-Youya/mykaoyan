import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { and, desc, eq } from "drizzle-orm"

import { PAPER_REVIEW_STATUSES, paperReviewSchema } from "@mykaoyan/core"
import { papers } from "@mykaoyan/db"

import { CONFIG } from "../config"
import { DatabaseService } from "../database"
import type { Database } from "../database"
import type { Environment } from "../environment"
import { answerQuestions, loadPaper, loadQuestionAnswers, paperColumns, paperSummary, questionCounts } from "./queries"
import { iso, PAGE_SIZE, parsePage, requireAdmin, reviewStatusOf } from "./shared"
import type { Actor, PaperReviewStatus } from "./shared"

export type ReviewQueueItem = {
  slug: string
  title: string
  year: number
  subjectCode: string
  origin: "user"
  reviewStatus: PaperReviewStatus
  listed: boolean
  questionCount: number
  ownerAccountId: string | null
  author: string
  rightsConfirmedAt: string | null
  createdAt: string
  reviewedAt: string | null
  reviewReason: string | null
}

export type ReviewResult = {
  slug: string
  reviewStatus: PaperReviewStatus
  listed: boolean
  reviewedAt: string
  reviewReason: string | null
}

/** 用户试卷审核：管理员列表、含答案预览与通过/驳回；真题发布路径不经过这里。 */
@Injectable()
export class PaperModerationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CONFIG) private readonly config: Environment,
  ) {}

  private get db(): Database {
    return this.database.db
  }

  async list(actor: Actor, status: string | undefined, page: string | number) {
    await requireAdmin(this.database, actor)
    if (status !== undefined && !(PAPER_REVIEW_STATUSES as readonly string[]).includes(status))
      throw new BadRequestException("审核状态无效")
    const offset = parsePage(page) * PAGE_SIZE
    const rows = await this.db
      .select(paperColumns)
      .from(papers)
      .where(and(eq(papers.origin, "user"), status === undefined ? undefined : eq(papers.reviewStatus, status)))
      .orderBy(desc(papers.createdAt), desc(papers.id))
      .limit(PAGE_SIZE + 1)
      .offset(offset)
    const visible = rows.slice(0, PAGE_SIZE)
    const counts = await questionCounts(
      this.db,
      visible.map((row) => row.id),
    )
    const items: ReviewQueueItem[] = visible.map((row) => ({
      ...paperSummary(row, counts.get(row.id) ?? 0),
      origin: "user",
      reviewStatus: reviewStatusOf(row.reviewStatus),
      listed: row.listed,
      ownerAccountId: row.ownerAccountId,
      author: row.ownerAccountId ? `考生 ${row.ownerAccountId.slice(-6)}` : "账号已删除",
      rightsConfirmedAt: iso(row.rightsConfirmedAt),
      createdAt: new Date(row.createdAt).toISOString(),
      reviewedAt: iso(row.reviewedAt),
      reviewReason: row.reviewReason,
    }))
    return { enabled: this.config.COMMUNITY_ENABLED, items, hasMore: rows.length > PAGE_SIZE }
  }

  /** 管理员完整预览：题面、答案与解析；用户试卷的审核依据。 */
  async detail(actor: Actor, slug: string) {
    await requireAdmin(this.database, actor)
    const paper = await loadPaper(this.db, slug)
    if (!paper) throw new NotFoundException("试卷不存在")
    const questions = await loadQuestionAnswers(this.db, paper.id)
    return {
      ...paperSummary(paper, questions.length),
      reviewStatus: reviewStatusOf(paper.reviewStatus),
      listed: paper.listed,
      ownerAccountId: paper.ownerAccountId,
      rightsConfirmedAt: iso(paper.rightsConfirmedAt),
      createdAt: new Date(paper.createdAt).toISOString(),
      reviewedAt: iso(paper.reviewedAt),
      reviewReason: paper.reviewReason,
      questions: answerQuestions(questions),
    }
  }

  /**
   * 通过或驳回：只处理 `pending`；社区开放时通过即上架，关闭时只记为已通过。
   * 重复审核返回 409，不覆盖已有审核记录。
   */
  async review(actor: Actor, slug: string, body: unknown): Promise<ReviewResult> {
    await requireAdmin(this.database, actor)
    const parsed = paperReviewSchema.safeParse(body ?? {})
    if (!parsed.success) throw new BadRequestException("审核须选择通过或驳回，驳回必须填写1至500字原因")
    const decision = parsed.data
    const now = new Date()
    const [saved] = await this.db
      .update(papers)
      .set({
        reviewStatus: decision.decision === "approve" ? "approved" : "rejected",
        reviewedAt: now,
        reviewerId: actor.id,
        reviewReason: decision.decision === "reject" ? decision.reason : null,
        listed: decision.decision === "approve" && this.config.COMMUNITY_ENABLED,
        updatedAt: now,
      })
      .where(and(eq(papers.slug, slug), eq(papers.origin, "user"), eq(papers.reviewStatus, "pending")))
      .returning({ slug: papers.slug, reviewStatus: papers.reviewStatus, listed: papers.listed })
    if (!saved) {
      const paper = await loadPaper(this.db, slug)
      if (!paper) throw new NotFoundException("试卷不存在")
      throw new ConflictException("试卷已审核，不能覆盖审核记录")
    }
    return {
      slug: saved.slug,
      reviewStatus: reviewStatusOf(saved.reviewStatus),
      listed: saved.listed,
      reviewedAt: now.toISOString(),
      reviewReason: decision.decision === "reject" ? decision.reason : null,
    }
  }
}
