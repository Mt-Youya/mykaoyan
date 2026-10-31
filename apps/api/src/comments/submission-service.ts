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
  submissionId: string
  submissionTitle: string
  submissionSubjectCode: string
  submissionStatus: string
  submissionListed: boolean
  deletedBy: string | null
  deleteReason: string | null
}
type VisibleSubmission = { id: string; accountId: string | null }
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
@Injectable()
export class SubmissionCommentsService {
  constructor(
    @Inject(DatabaseService) private database: DatabaseService,
    @Inject(MembershipService) private membership: MembershipService,
    @Inject(CONFIG) private config: Environment,
  ) {}
  private async admin(actor: Actor) {
    const [row] = await this.database.client<{ role: string }[]>`select role from accounts where id=${actor.id}`
    if (actor.role !== "admin" || row?.role !== "admin") throw new ForbiddenException("只有管理员能管理投稿评论")
  }
  private page(page: number) {
    if (!Number.isInteger(page) || page < 0 || page > 1_000_000) throw new BadRequestException("页码无效")
  }
  /** 公开读取与发表都只认已通过并上架的投稿；未上架、未通过或文件已清理一律 404。 */
  private async visibleSubmission(id: string): Promise<VisibleSubmission> {
    if (!z.uuid().safeParse(id).success) throw new NotFoundException("投稿不存在或未上架")
    const [row] = await this.database.client<
      { id: string; account_id: string | null }[]
    >`select id,account_id from submissions where id=${id} and status='approved' and listed and delete_marked_at is null and deleted_at is null`
    if (!row) throw new NotFoundException("投稿不存在或未上架")
    return { id: row.id, accountId: row.account_id }
  }
  private rows(submissionId: string | null, page: number) {
    const sql = this.database.client
    return sql<
      Row[]
    >`select c.id,c.submission_id as "submissionId",c.body,c.account_id as "accountId",c.parent_id as "parentId",c.created_at as "createdAt",c.deleted_at as "deletedAt",p.body as "parentBody",p.account_id as "parentAccountId",p.deleted_at as "parentDeletedAt",s.title as "submissionTitle",s.subject_code as "submissionSubjectCode",s.status as "submissionStatus",s.listed as "submissionListed",d.actor_id as "deletedBy",d.reason as "deleteReason" from submission_comments c join submissions s on s.id=c.submission_id left join submission_comments p on p.id=c.parent_id left join submission_comment_deletions d on d.comment_id=c.id ${submissionId ? sql`where c.submission_id=${submissionId}` : sql``} order by c.created_at desc,c.id desc limit 51 offset ${page * 50}`
  }
  private async viewer(accountId: string | null, owner: string | null): Promise<Viewer> {
    if (!accountId) return { signedIn: false, member: false, owner: false }
    return {
      signedIn: true,
      member: (await this.membership.status(accountId)).active,
      owner: owner === accountId,
    }
  }
  async list(id: string, page: number, viewerId: string | null) {
    this.page(page)
    if (!this.config.COMMUNITY_ENABLED) return { enabled: false, items: [], hasMore: false }
    const submission = await this.visibleSubmission(id)
    const rows = await this.rows(submission.id, page)
    return {
      enabled: true,
      items: rows.slice(0, 50).map(publicComment),
      hasMore: rows.length > 50,
      viewer: await this.viewer(viewerId, submission.accountId),
    }
  }
  async create(accountId: string, id: string, input: unknown) {
    if (!this.config.COMMUNITY_ENABLED) throw new ForbiddenException("评论尚未开放")
    const submission = await this.visibleSubmission(id)
    // 投稿上传者本人在自己的投稿下评论、回复不要求会员；其他账号仍须有效会员。
    if (submission.accountId !== accountId && !(await this.membership.status(accountId)).active)
      throw new ForbiddenException("评论需要有效会员；投稿上传者本人可免会员评论自己的投稿")
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
        >`select parent_id,deleted_at from submission_comments where id=${parentId} and submission_id=${submission.id} for update`
        if (!parent || parent.parent_id || parent.deleted_at)
          throw new BadRequestException("只能回复同一投稿下未删除的原评论，不能回复回复")
      }
      const [saved] = await sql<
        { id: string }[]
      >`insert into submission_comments(submission_id,account_id,parent_id,body) values(${submission.id},${accountId},${parentId ?? null},${body}) returning id`
      if (!saved) throw new Error("投稿评论写入未返回记录")
      return { id: saved.id }
    })
  }
  async listAdmin(actor: Actor, page: number) {
    await this.admin(actor)
    this.page(page)
    const rows = await this.rows(null, page)
    return {
      items: rows.slice(0, 50).map((row) => ({
        ...publicComment(row),
        submissionId: row.submissionId,
        submissionTitle: row.submissionTitle,
        submissionSubjectCode: row.submissionSubjectCode,
        submissionStatus: row.submissionStatus,
        submissionListed: row.submissionListed,
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
      >`select deleted_at from submission_comments where id=${id} for update`
      if (!row) throw new NotFoundException("投稿评论不存在")
      if (row.deleted_at) throw new ConflictException("评论已删除，不能改写删除记录")
      const [deleted] = await sql`update submission_comments set deleted_at=now() where id=${id} returning id`
      const [audit] =
        await sql`insert into submission_comment_deletions(comment_id,actor_id,reason) values(${id},${actor.id},${parsed.data.reason}) returning id`
      if (!deleted || !audit) throw new Error("投稿评论删除未写入完整记录")
      return { id, deleted: true }
    })
  }
}
