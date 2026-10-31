import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { z } from "zod"

import { CONFIG } from "../config"
import { DatabaseService } from "../database"
import type { Environment } from "../environment"
export type Actor = { id: string; role: string }
export type SubmissionKind = "video" | "manuscript"
export type SubmissionRow = {
  id: string
  account_id: string | null
  kind: SubmissionKind
  title: string
  summary: string
  subject_code: string
  topic_id: string | null
  size: number | null
  duration: number | null
  manuscript_markdown: string | null
  fingerprint: string
  object_key: string | null
  upload_id: string | null
  status: "uploading" | "pending" | "approved" | "rejected"
  listed: boolean
  created_at: string | Date
  reviewed_at: string | Date | null
  reviewer_id: string | null
  reason: string | null
  delete_marked_at: string | Date | null
  cleanup_attempted_at: string | Date | null
  deleted_at: string | Date | null
}
export type SubtitleRow = {
  id: string
  submission_id: string
  language: string
  label: string
  source_format: "srt" | "vtt"
  vtt_content: string
  bytes: number
  created_at: string | Date
  updated_at: string | Date
}
/** 字幕元数据：列表与本人视图只给语言与显示名，正文单独按需读取。 */
export type SubtitleMeta = { language: string; label: string }
/** 列表行不读取手稿正文，只带 octet_length；正文由详情接口按需读取。 */
export type SubmissionListRow = Omit<SubmissionRow, "manuscript_markdown"> & { manuscript_bytes: number | null }
export function toListRow(row: SubmissionRow): SubmissionListRow {
  const { manuscript_markdown, ...rest } = row
  return {
    ...rest,
    manuscript_bytes: manuscript_markdown === null ? null : Buffer.byteLength(manuscript_markdown, "utf8"),
  }
}
type PublicSubmission = Pick<
  SubmissionRow,
  | "id"
  | "kind"
  | "title"
  | "summary"
  | "subject_code"
  | "topic_id"
  | "duration"
  | "status"
  | "listed"
  | "account_id"
  | "created_at"
> & { manuscriptBytes?: number | null }
const author = (id: string | null) => (id ? `考生 ${id.slice(-6)}` : "账号已删除")
export function submissionView(r: PublicSubmission) {
  return {
    id: r.id,
    kind: r.kind ?? "video",
    title: r.title,
    summary: r.summary,
    subjectCode: r.subject_code,
    topicId: r.topic_id,
    duration: r.duration,
    status: r.status,
    listed: r.listed,
    manuscriptBytes: r.manuscriptBytes ?? null,
    author: author(r.account_id),
    createdAt: new Date(r.created_at).toISOString(),
  }
}
export function ownSubmissionView(r: SubmissionListRow, subtitles: SubtitleMeta[] = []) {
  return {
    ...submissionView({ ...r, manuscriptBytes: r.manuscript_bytes }),
    size: r.size,
    fingerprint: r.fingerprint,
    reason: r.reason,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
    deleteMarked: !!r.delete_marked_at,
    deleted: !!r.deleted_at,
    hasManuscript: r.kind === "manuscript",
    hasSubtitles: subtitles.length > 0,
    subtitleLanguages: subtitles.map((subtitle) => subtitle.language),
    subtitles,
  }
}
@Injectable()
export class SubmissionAccess {
  constructor(
    @Inject(CONFIG) public config: Environment,
    @Inject(DatabaseService) public database: DatabaseService,
  ) {}
  open() {
    if (!this.config.COMMUNITY_ENABLED) throw new ForbiddenException("投稿尚未开放")
  }
  async isAdmin(actor: Actor | null) {
    if (!actor || actor.role !== "admin") return false
    const [row] = await this.database.client<{ role: string }[]>`select role from accounts where id=${actor.id}`
    return row?.role === "admin"
  }
  async admin(actor: Actor) {
    if (!(await this.isAdmin(actor))) throw new ForbiddenException("只有管理员能审核投稿")
  }
  id(id: string) {
    if (!z.uuid().safeParse(id).success) throw new NotFoundException("投稿不存在")
  }
  page(page: number) {
    if (!Number.isInteger(page) || page < 0 || page > 1_000_000) throw new BadRequestException("页码无效")
  }
  /** 公开可见：社区开放、已通过、已上架且未标记/完成清理。 */
  publicVisible(row: SubmissionRow) {
    return (
      this.config.COMMUNITY_ENABLED &&
      row.status === "approved" &&
      row.listed &&
      !row.delete_marked_at &&
      !row.deleted_at
    )
  }
  async find(id: string) {
    const [row] = await this.database.client<SubmissionRow[]>`select * from submissions where id=${id}`
    return row ?? null
  }
  async owned(accountId: string, id: string) {
    this.id(id)
    const [row] = await this.database.client<
      SubmissionRow[]
    >`select * from submissions where id=${id} and account_id=${accountId}`
    if (!row) throw new NotFoundException("投稿不存在")
    return row
  }
  /** 一次查出多份投稿的字幕元数据，供列表与本人视图使用。 */
  async subtitles(ids: string[]) {
    const map = new Map<string, SubtitleMeta[]>()
    if (!ids.length) return map
    const rows = await this.database.client<
      { submission_id: string; language: string; label: string }[]
    >`select submission_id,language,label from submission_subtitles where submission_id in ${this.database.client(ids)} order by submission_id,language`
    for (const row of rows) {
      const list = map.get(row.submission_id) ?? []
      list.push({ language: row.language, label: row.label })
      map.set(row.submission_id, list)
    }
    return map
  }
  async ownView(row: SubmissionRow) {
    return ownSubmissionView(toListRow(row), (await this.subtitles([row.id])).get(row.id) ?? [])
  }
  async ownViews(rows: SubmissionListRow[]) {
    const subtitles = await this.subtitles(rows.map((row) => row.id))
    return rows.map((row) => ownSubmissionView(row, subtitles.get(row.id) ?? []))
  }
}
