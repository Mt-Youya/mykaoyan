import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { z } from "zod"

import { blockedComment, normalizeKeywords } from "@mykaoyan/core"

import { CONFIG } from "../config"
import { DatabaseService } from "../database"
import type { Environment } from "../environment"
import { MembershipService } from "../membership"
type Actor = { id: string; role: string }
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
  lessonSlug: string
  deletedBy: string | null
  deleteReason: string | null
}
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
@Injectable()
export class CommentsService {
  constructor(
    @Inject(DatabaseService) private database: DatabaseService,
    @Inject(MembershipService) private membership: MembershipService,
    @Inject(CONFIG) private config: Environment,
  ) {}
  private async admin(actor: Actor) {
    const [row] = await this.database.client<{ role: string }[]>`select role from accounts where id=${actor.id}`
    if (actor.role !== "admin" || row?.role !== "admin") throw new ForbiddenException("只有管理员能管理评论")
  }
  private page(page: number) {
    if (!Number.isInteger(page) || page < 0 || page > 1_000_000) throw new BadRequestException("页码无效")
  }
  private async lesson(slug: string) {
    const [row] = await this.database.client<
      { id: string }[]
    >`select l.id from lessons l join chapters ch on ch.id=l.chapter_id join courses c on c.id=ch.course_id where l.slug=${slug} and l.listed and ch.listed and c.listed`
    if (!row) throw new NotFoundException("讲不存在或未上架")
    return row.id
  }
  async list(slug: string, page: number) {
    this.page(page)
    if (!this.config.COMMUNITY_ENABLED) return { enabled: false, items: [], hasMore: false }
    const lessonId = await this.lesson(slug)
    const rows = await this.rows(lessonId, page)
    return { enabled: true, items: rows.slice(0, 50).map(publicComment), hasMore: rows.length > 50 }
  }
  private rows(lessonId: string | null, page: number) {
    const sql = this.database.client
    return sql<
      Row[]
    >`select c.id,c.body,c.account_id as "accountId",c.parent_id as "parentId",c.created_at as "createdAt",c.deleted_at as "deletedAt",p.body as "parentBody",p.account_id as "parentAccountId",p.deleted_at as "parentDeletedAt",l.slug as "lessonSlug",d.actor_id as "deletedBy",d.reason as "deleteReason" from comments c join lessons l on l.id=c.lesson_id left join comments p on p.id=c.parent_id left join comment_deletions d on d.comment_id=c.id ${lessonId ? sql`where c.lesson_id=${lessonId}` : sql``} order by c.created_at desc,c.id desc limit 51 offset ${page * 50}`
  }
  async create(accountId: string, slug: string, input: unknown) {
    if (!this.config.COMMUNITY_ENABLED) throw new ForbiddenException("评论尚未开放")
    if (!(await this.membership.status(accountId)).active)
      throw new ForbiddenException("评论需要有效会员，请先手动开通或兑换会员期")
    const parsed = z
      .strictObject({ body: z.string().trim().min(1).max(2000), parentId: z.uuid().nullable().optional() })
      .safeParse(input)
    if (!parsed.success) throw new BadRequestException("评论需为1至2000字；回复只能指定原评论")
    const lessonId = await this.lesson(slug),
      { body, parentId } = parsed.data
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
        >`select parent_id,deleted_at from comments where id=${parentId} and lesson_id=${lessonId} for update`
        if (!parent || parent.parent_id || parent.deleted_at)
          throw new BadRequestException("只能回复同一讲下未删除的原评论，不能回复回复")
      }
      const [saved] = await sql<
        { id: string }[]
      >`insert into comments(lesson_id,account_id,parent_id,body) values(${lessonId},${accountId},${parentId ?? null},${body}) returning id`
      if (!saved) throw new Error("评论写入未返回记录")
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
        lessonSlug: row.lessonSlug,
        deletedBy: row.deletedBy,
        deleteReason: row.deleteReason,
        deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
      })),
      hasMore: rows.length > 50,
    }
  }
  async keywords(actor: Actor) {
    await this.admin(actor)
    return {
      keywords: (await this.database.client<{ word: string }[]>`select word from comment_keywords order by word`).map(
        (row) => row.word,
      ),
    }
  }
  async setKeywords(actor: Actor, input: unknown) {
    await this.admin(actor)
    const parsed = z.strictObject({ keywords: z.array(z.string().trim().min(1).max(100)).max(500) }).safeParse(input)
    if (!parsed.success) throw new BadRequestException("最多500个关键词，每个1至100字")
    const keywords = normalizeKeywords(parsed.data.keywords)
    await this.database.client.begin(async (sql) => {
      await sql`lock table comment_keywords in exclusive mode`
      await sql`delete from comment_keywords`
      if (keywords.length) {
        const rows = await sql`insert into comment_keywords ${sql(keywords.map((word) => ({ word })))} returning word`
        if (rows.length !== keywords.length) throw new Error("关键词写入数量不符")
      }
    })
    return { keywords }
  }
  async remove(actor: Actor, id: string, input: unknown) {
    await this.admin(actor)
    const parsed = z.strictObject({ reason: z.string().trim().min(1).max(500) }).safeParse(input)
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new BadRequestException("删除评论必须提供有效编号和1至500字原因")
    return this.database.client.begin(async (sql) => {
      const [row] = await sql<
        { deleted_at: string | null }[]
      >`select deleted_at from comments where id=${id} for update`
      if (!row) throw new NotFoundException("评论不存在")
      if (row.deleted_at) throw new ConflictException("评论已删除，不能改写删除记录")
      const [deleted] = await sql`update comments set deleted_at=now() where id=${id} returning id`
      const [audit] =
        await sql`insert into comment_deletions(comment_id,actor_id,reason) values(${id},${actor.id},${parsed.data.reason}) returning id`
      if (!deleted || !audit) throw new Error("评论删除未写入完整记录")
      return { id, deleted: true }
    })
  }
}
