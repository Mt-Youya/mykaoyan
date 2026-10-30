import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { z } from "zod"
import { CONFIG } from "../config"
import type { Environment } from "../environment"
import { DatabaseService } from "../database"
import { MembershipService } from "../membership"
export type Actor = { id: string; role: string }
export type SubmissionRow = {
  id: string
  account_id: string | null
  title: string
  summary: string
  subject_code: string
  topic_id: string | null
  size: number
  duration: number
  fingerprint: string
  object_key: string
  upload_id: string | null
  status: "uploading" | "pending" | "approved" | "rejected"
  listed: boolean
  created_at: string | Date
  reviewed_at: string | Date | null
  reviewer_id: string | null
  reason: string | null
  delete_marked_at: string | Date | null
  deleted_at: string | Date | null
}
export function submissionView(
  r: Pick<
    SubmissionRow,
    | "id"
    | "title"
    | "summary"
    | "subject_code"
    | "topic_id"
    | "duration"
    | "status"
    | "listed"
    | "account_id"
    | "created_at"
  >
) {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    subjectCode: r.subject_code,
    topicId: r.topic_id,
    duration: r.duration,
    status: r.status,
    listed: r.listed,
    author: r.account_id ? `考生 ${r.account_id.slice(-6)}` : "账号已删除",
    createdAt: new Date(r.created_at).toISOString(),
  }
}
export function ownSubmissionView(r: SubmissionRow) {
  return {
    ...submissionView(r),
    size: r.size,
    fingerprint: r.fingerprint,
    reason: r.reason,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
    deleteMarked: !!r.delete_marked_at,
    deleted: !!r.deleted_at,
  }
}
@Injectable()
export class SubmissionAccess {
  constructor(
    @Inject(CONFIG) public config: Environment,
    @Inject(DatabaseService) public database: DatabaseService,
    @Inject(MembershipService) private membership: MembershipService
  ) {}
  open() {
    if (!this.config.COMMUNITY_ENABLED) throw new ForbiddenException("投稿尚未开放")
  }
  async member(id: string) {
    this.open()
    if (!(await this.membership.status(id)).active)
      throw new ForbiddenException("投稿需要有效会员，请先手动开通或兑换会员期")
  }
  async admin(actor: Actor) {
    const [row] = await this.database.client<{ role: string }[]>`select role from accounts where id=${actor.id}`
    if (actor.role !== "admin" || row?.role !== "admin") throw new ForbiddenException("只有管理员能审核投稿")
  }
  id(id: string) {
    if (!z.uuid().safeParse(id).success) throw new NotFoundException("投稿不存在")
  }
  page(page: number) {
    if (!Number.isInteger(page) || page < 0 || page > 1_000_000) throw new BadRequestException("页码无效")
  }
  async owned(accountId: string, id: string) {
    this.id(id)
    const [row] = await this.database.client<
      SubmissionRow[]
    >`select * from submissions where id=${id} and account_id=${accountId}`
    if (!row) throw new NotFoundException("投稿不存在")
    return row
  }
}
