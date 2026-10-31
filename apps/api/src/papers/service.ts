import { ForbiddenException, Inject, Injectable } from "@nestjs/common"
import { and, asc, desc, eq } from "drizzle-orm"

import { papers } from "@mykaoyan/db"

import { CONFIG } from "../config"
import { DatabaseService } from "../database"
import type { Database } from "../database"
import type { Environment } from "../environment"
import { MembershipService } from "../membership"
import {
  answerQuestions,
  loadPaper,
  loadQuestionAnswers,
  loadQuestions,
  paperColumns,
  paperSummary,
  publicQuestions,
  questionCounts,
} from "./queries"
import { isAdmin, originOf, publiclyVisible } from "./shared"
import type { Actor, PaperAnswers, PaperDetail, PaperOrigin, PaperSummary } from "./shared"

/** 试卷来源筛选：默认 `admin`（站主真题），`user` 只列已通过且上架的用户投稿。 */
export type PaperOriginFilter = PaperOrigin

/**
 * 已上架试卷的只读查询：题面公开，答案只在登录后的答案接口返回。
 *
 * 真题（`origin='admin'`）保持原有行为；用户试卷（`origin='user'`）要求已通过、
 * 已上架且社区开放，否则一律 404，不泄露未审核内容的存在。
 */
@Injectable()
export class PapersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MembershipService) private readonly membership: MembershipService,
    @Inject(CONFIG) private readonly config: Environment,
  ) {}

  private get db(): Database {
    return this.database.db
  }

  async list(subjectCode: string, origin: PaperOriginFilter = "admin"): Promise<PaperSummary[]> {
    // 社区关闭时用户试卷公开出口整体为空，真题列表不受影响。
    if (origin === "user" && !this.config.COMMUNITY_ENABLED) return []
    const rows = await this.db
      .select(paperColumns)
      .from(papers)
      .where(
        and(
          eq(papers.origin, origin),
          eq(papers.reviewStatus, "approved"),
          eq(papers.listed, true),
          eq(papers.subjectCode, subjectCode),
        ),
      )
      .orderBy(desc(papers.year), asc(papers.position))
    if (!rows.length) return []
    const total = await questionCounts(
      this.db,
      rows.map((row) => row.id),
    )
    return rows.map((row) => paperSummary(row, total.get(row.id) ?? 0))
  }

  async get(slug: string): Promise<PaperDetail | undefined> {
    const paper = await loadPaper(this.db, slug)
    if (!paper || !publiclyVisible(paper, this.config.COMMUNITY_ENABLED)) return undefined
    const questions = await loadQuestions(this.db, paper.id)
    return { ...paperSummary(paper, questions.length), questions: publicQuestions(questions) }
  }

  /** 答案页内容；调用方已经完成可见性与权限判断。 */
  private async answersView(slug: string): Promise<PaperAnswers | undefined> {
    const paper = await loadPaper(this.db, slug)
    if (!paper) return undefined
    const questions = await loadQuestionAnswers(this.db, paper.id)
    return {
      slug: paper.slug,
      title: paper.title,
      year: paper.year,
      origin: originOf(paper.origin),
      questions: answerQuestions(questions),
    }
  }

  /**
   * 登录后的答案接口：已通过且上架的试卷对会员开放；试卷上传者本人与管理员可预览未上架
   * 的用户试卷（含待审、驳回），但别人看不到。调用方负责会话校验。
   */
  async answersFor(actor: Actor, slug: string): Promise<PaperAnswers | undefined> {
    const paper = await loadPaper(this.db, slug)
    if (!paper) return undefined
    const viewerIsAdmin = await isAdmin(this.database, actor)
    // 上传者例外按「当前账号 = 试卷所有者」判断，不按会员期；真题发布者同样适用。
    const owner = paper.ownerAccountId === actor.id
    // 未公开的试卷：本人与管理员可预览，其他人一律 404，避免泄露待审内容。
    if (!publiclyVisible(paper, this.config.COMMUNITY_ENABLED) && !owner && !viewerIsAdmin) return undefined
    if (!owner && !viewerIsAdmin) {
      if (!(await this.membership.status(actor.id)).active)
        throw new ForbiddenException("查看答案需要有效会员；试卷上传者本人可查看自己上传试卷的答案")
    }
    return this.answersView(slug)
  }
}
