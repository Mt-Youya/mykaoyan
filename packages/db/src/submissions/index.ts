import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import { accounts } from "../accounts"
/**
 * 投稿：登录账号上传的课程材料。
 *
 * `kind` 区分形态（`video` 视频 / `manuscript` 手稿），形态专属列可空并由 check 按 `kind` 收紧；
 * 审核、上架、评分、清理与归属仍是同一套共享行为。
 */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid().primaryKey(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    kind: text().notNull().default("video"),
    title: text().notNull(),
    summary: text().notNull(),
    subjectCode: text("subject_code").notNull(),
    topicId: text("topic_id"),
    size: integer(),
    duration: doublePrecision(),
    manuscriptMarkdown: text("manuscript_markdown"),
    fingerprint: text().notNull(),
    objectKey: text("object_key").unique(),
    uploadId: text("upload_id"),
    status: text().notNull().default("uploading"),
    listed: boolean().notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerId: uuid("reviewer_id").references(() => accounts.id, { onDelete: "set null" }),
    reason: text(),
    deleteMarkedAt: timestamp("delete_marked_at", { withTimezone: true }),
    cleanupAttemptedAt: timestamp("cleanup_attempted_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("submissions_account_created_idx").on(t.accountId, t.createdAt),
    index("submissions_subject_created_idx").on(t.subjectCode, t.createdAt),
    index("submissions_status_reviewed_idx").on(t.status, t.reviewedAt),
    index("submissions_subject_kind_status_listed_created_idx").on(
      t.subjectCode,
      t.kind,
      t.status,
      t.listed,
      t.createdAt,
    ),
    check("submissions_kind", sql`${t.kind} in ('video','manuscript')`),
    check("submissions_state", sql`${t.status} in ('uploading','pending','approved','rejected')`),
    check(
      "submissions_visibility",
      sql`not ${t.listed} or (${t.status}='approved' and ${t.deletedAt} is null and ${t.deleteMarkedAt} is null)`,
    ),
    check(
      "submissions_kind_limits",
      sql`(${t.kind}='video' and ${t.size} is not null and ${t.size}>0 and ${t.size}<=500000000 and ${t.duration} is not null and ${t.duration}>0 and ${t.duration}<=1800 and ${t.objectKey} is not null and ${t.manuscriptMarkdown} is null) or (${t.kind}='manuscript' and ${t.size} is null and ${t.duration} is null and ${t.objectKey} is null and ${t.uploadId} is null and ${t.status}<>'uploading' and ((${t.manuscriptMarkdown} is not null and length(${t.manuscriptMarkdown}) between 1 and 1000000 and octet_length(${t.manuscriptMarkdown}) between 1 and 1048576) or ${t.deletedAt} is not null))`,
    ),
    check(
      "submissions_review",
      sql`(${t.status} in ('uploading','pending') and ${t.reviewedAt} is null) or (${t.status} in ('approved','rejected') and ${t.reviewedAt} is not null and (${t.status}<>'rejected' or length(trim(${t.reason})) between 1 and 500))`,
    ),
  ],
).enableRLS()

/**
 * 视频投稿的字幕轨：上传的 SRT/VTT 由服务端解析并归一化为 VTT 正文直存。
 *
 * 一个投稿最多两条由服务层在同一事务内校验；语言标签唯一由数据库约束保证。
 */
export const submissionSubtitles = pgTable(
  "submission_subtitles",
  {
    id: uuid().defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    language: text().notNull(),
    label: text().notNull(),
    sourceFormat: text("source_format").notNull(),
    vttContent: text("vtt_content").notNull(),
    bytes: integer().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("submission_subtitles_submission_language_unique").on(t.submissionId, t.language),
    check("submission_subtitles_language", sql`${t.language} ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'`),
    check("submission_subtitles_label", sql`length(btrim(${t.label})) between 1 and 50`),
    check("submission_subtitles_source_format", sql`${t.sourceFormat} in ('srt','vtt')`),
    check(
      "submission_subtitles_bytes",
      sql`${t.bytes} between 1 and 262144 and ${t.bytes}=octet_length(${t.vttContent})`,
    ),
  ],
).enableRLS()
