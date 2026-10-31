import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { z } from "zod"

import { blockedComment } from "@mykaoyan/core"

import { CONFIG } from "../config"
import { DatabaseService } from "../database"
import type { Environment } from "../environment"
import { MembershipService } from "../membership"
type Actor = { id: string; role: string }
type Viewer = { signedIn: boolean; member: boolean; owner: boolean }
type VisiblePaper = {
  id: string
  slug: string
  title: string
  subjectCode: string
  origin: string
  reviewStatus: string
  listed: boolean
  ownerAccountId: string | null
}
type Row = {
  id: string
  body: string
  accountId: string | null
  parentId: string | null
  createdAt: string | Date
  deletedAt: string | Date | null
  parentBody: string | null
  parentAccountId: string | null
  parentDeletedAt: string | Date | null
  paperSlug: string
  paperTitle: string
  paperSubjectCode: string
  paperOrigin: string
  paperReviewStatus: string
  paperListed: boolean
  deletedBy: string | null
  deleteReason: string | null
}
/** 管理员列表的删除状态筛选：`all` 全部、`visible` 未删除、`deleted` 已删除。 */
export type PaperCommentState = "all" | "visible" | "deleted"
const states: readonly PaperCommentState[] = ["all", "visible", "deleted"]
const author = (id: string | null) => (id ? `考生 ${id.slice(-6)}` : "账号已删除")
function publicComment(row: Row) {
  return {
    id: row.id,
    parentId: row.parentId,
    author: author(row.accountId),
    body: row.deletedAt ? "已删除" : row.body,
    deleted: !!row.deletedAt,
    createdAt: new Date(row.createdAt).toISOString(),
    parent: row.parentId
      ? { id: row.parentId, author: author(row.parentAccountId), body: row.parentDeletedAt ? "已删除" : row.parentBody }
      : null,
  }
}
const parseBody = (input: unknown) =>
  z
    .strictObject({ body: z.string().trim().min(1).max(2000), parentId: z.uuid().nullable().optional() })
    .safeParse(input)
function parseFilter(q: string | undefined, state: string | undefined) {
  const keyword = (q ?? "").trim()
  if (keyword.length > 100) throw new BadRequestException("评论搜索关键词最多100字")
  const parsed = (state ?? "all") as PaperCommentState
  if (!states.includes(parsed)) throw new BadRequestException("评论筛选只能是 all、visible 或 deleted")
  return { q: keyword, state: parsed }
}
/**
 * 用户试卷评论：结构与投稿评论一致（一层回复、关键词复用 `comment_keywords`、删除遮蔽）。
 *
 * 公开读取只认已上架且可见的试卷（用户试卷还要求已通过且社区开放）；发表要求登录，
 * 有效会员或该试卷上传者本人可写。删除只由管理员执行并写 `paper_comment_deletions` 审计。
 */
@Injectable()
export class PaperCommentsService {
  constructor(
    @Inject(DatabaseService) private database: DatabaseService,
    @Inject(MembershipService) private membership: MembershipService,
    @Inject(CONFIG) private config: Environment,
  ) {}
  private async admin(actor: Actor) {
    const [row] = await this.database.client<{ role: string }[]>`select role from accounts where id=${actor.id}`
    if (actor.role !== "admin" || row?.role !== "admin") throw new ForbiddenException("只有管理员能管理试卷评论")
  }
  private page(page: number) {
    if (!Number.isInteger(page) || page < 0 || page > 1_000_000) throw new BadRequestException("页码无效")
  }
  /** 公开可见：已上架且已通过；用户试卷还要求社区开放。未上架、待审与不存在一律 404。 */
  private async visiblePaper(slug: string): Promise<VisiblePaper> {
    const [row] = await this.database.client<VisiblePaper[]>`
      select id,slug,title,subject_code as "subjectCode",origin,review_status as "reviewStatus",listed,owner_account_id as "ownerAccountId" from papers where slug=${slug}`
    if (!row) throw new NotFoundException("试卷不存在或未上架")
    const visible =
      row.reviewStatus === "approved" && row.listed && (row.origin === "admin" || this.config.COMMUNITY_ENABLED)
    if (!visible) throw new NotFoundException("试卷不存在或未上架")
    return row
  }
  private rows(page: number, paperId: string | null, q = "", state: PaperCommentState = "all") {
    const sql = this.database.client
    return sql<Row[]>`
      select c.id,c.body,c.account_id as "accountId",c.parent_id as "parentId",c.created_at as "createdAt",c.deleted_at as "deletedAt",p.body as "parentBody",p.account_id as "parentAccountId",p.deleted_at as "parentDeletedAt",pa.slug as "paperSlug",pa.title as "paperTitle",pa.subject_code as "paperSubjectCode",pa.origin as "paperOrigin",pa.review_status as "paperReviewStatus",pa.listed as "paperListed",d.actor_id as "deletedBy",d.reason as "deleteReason"
      from paper_comments c join papers pa on pa.id=c.paper_id left join paper_comments p on p.id=c.parent_id left join paper_comment_deletions d on d.comment_id=c.id
      where (${paperId}::uuid is null or c.paper_id=${paperId}::uuid)
        and (${q} = '' or strpos(lower(pa.title || ' ' || c.body), lower(${q})) > 0)
        and (${state} = 'all'
          or (${state} = 'visible' and c.deleted_at is null)
          or (${state} = 'deleted' and c.deleted_at is not null))
      order by c.created_at desc,c.id desc limit 51 offset ${page * 50}`
  }
  private async viewer(accountId: string | null, owner: string | null): Promise<Viewer> {
    if (!accountId) return { signedIn: false, member: false, owner: false }
    return {
      signedIn: true,
      member: (await this.membership.status(accountId)).active,
      owner: owner === accountId,
    }
  }
  async list(slug: string, page: number, viewerId: string | null) {
    this.page(page)
    if (!this.config.COMMUNITY_ENABLED) return { enabled: false, items: [], hasMore: false }
    const paper = await this.visiblePaper(slug)
    const rows = await this.rows(page, paper.id)
    return {
      enabled: true,
      items: rows.slice(0, 50).map(publicComment),
      hasMore: rows.length > 50,
      viewer: await this.viewer(viewerId, paper.ownerAccountId),
    }
  }
  async create(accountId: string, slug: string, input: unknown) {
    if (!this.config.COMMUNITY_ENABLED) throw new ForbiddenException("评论尚未开放")
    const paper = await this.visiblePaper(slug)
    // 试卷上传者本人在自己的试卷下评论、回复不要求会员；其他账号仍须有效会员。
    if (paper.ownerAccountId !== accountId && !(await this.membership.status(accountId)).active)
      throw new ForbiddenException("评论需要有效会员；试卷上传者本人可免会员评论自己上传的试卷")
    const parsed = parseBody(input)
    if (!parsed.success) throw new BadRequestException("评论需为1至2000字；回复只能指定原评论")
    const { body, parentId } = parsed.data
    return this.database.client.begin(async (sql) => {
      const keywords = await sql<{ word: string }[]>`select word from comment_keywords`
      if (
        blockedComment(
          body,
          keywords.map((row) => row.word),
        )
      )
        throw new BadRequestException("评论含有禁止的关键词，请修改后再发送")
      if (parentId) {
        const [parent] = await sql<
          { parent_id: string | null; deleted_at: string | null }[]
        >`select parent_id,deleted_at from paper_comments where id=${parentId} and paper_id=${paper.id} for update`
        if (!parent || parent.parent_id || parent.deleted_at)
          throw new BadRequestException("只能回复同一试卷下未删除的原评论，不能回复回复")
      }
      const [saved] = await sql<
        { id: string }[]
      >`insert into paper_comments(paper_id,account_id,parent_id,body) values(${paper.id},${accountId},${parentId ?? null},${body}) returning id`
      if (!saved) throw new Error("试卷评论写入未返回记录")
      return { id: saved.id }
    })
  }
  async listAdmin(actor: Actor, page: number, q?: string, state?: string) {
    await this.admin(actor)
    this.page(page)
    const filter = parseFilter(q, state)
    const rows = await this.rows(page, null, filter.q, filter.state)
    return {
      items: rows.slice(0, 50).map((row) => ({
        ...publicComment(row),
        paperSlug: row.paperSlug,
        paperTitle: row.paperTitle,
        paperSubjectCode: row.paperSubjectCode,
        paperOrigin: row.paperOrigin,
        paperReviewStatus: row.paperReviewStatus,
        paperListed: row.paperListed,
        deletedBy: row.deletedBy,
        deleteReason: row.deleteReason,
        deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
      })),
      hasMore: rows.length > 50,
    }
  }
  async remove(actor: Actor, id: string, input: unknown) {
    await this.admin(actor)
    const parsed = z.strictObject({ reason: z.string().trim().min(1).max(500) }).safeParse(input)
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new BadRequestException("删除评论必须提供有效编号和1至500字原因")
    return this.database.client.begin(async (sql) => {
      const [row] = await sql<
        { deleted_at: string | null }[]
      >`select deleted_at from paper_comments where id=${id} for update`
      if (!row) throw new NotFoundException("试卷评论不存在")
      if (row.deleted_at) throw new ConflictException("评论已删除，不能改写删除记录")
      const [deleted] = await sql`update paper_comments set deleted_at=now() where id=${id} returning id`
      const [audit] =
        await sql`insert into paper_comment_deletions(comment_id,actor_id,reason) values(${id},${actor.id},${parsed.data.reason}) returning id`
      if (!deleted || !audit) throw new Error("试卷评论删除未写入完整记录")
      return { id, deleted: true }
    })
  }
}
