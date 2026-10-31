import { sql } from "drizzle-orm"
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { accounts } from "../accounts"

/**
 * 试卷：按考试科目与年份整理的一整套试题。
 *
 * 题面公开；答案与解析只经会员或试卷上传者的答案接口读取，不进入公开接口与页面。
 * `origin` 区分站主取得授权后发布的真题（`admin`）与用户投稿（`user`）；用户试卷先审后发，
 * `listed` 仍由管理员单独改变。
 */
export const papers = pgTable(
  "papers",
  {
    id: uuid().defaultRandom().primaryKey(),
    subjectCode: text("subject_code").notNull(),
    year: integer().notNull(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    sourceNote: text("source_note"),
    origin: text().notNull().default("admin"),
    reviewStatus: text("review_status").notNull().default("approved"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerId: uuid("reviewer_id").references(() => accounts.id, { onDelete: "set null" }),
    reviewReason: text("review_reason"),
    rightsConfirmedAt: timestamp("rights_confirmed_at", { withTimezone: true }),
    position: integer().notNull(),
    listed: boolean().notNull().default(false),
    ownerAccountId: uuid("owner_account_id").references(() => accounts.id, { onDelete: "set null" }),
    contentHash: text("content_hash"),
    contentVersion: integer("content_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("papers_subject_year_position_idx").on(table.subjectCode, table.year, table.position),
    index("papers_origin_review_subject_year_position_idx").on(
      table.origin,
      table.reviewStatus,
      table.subjectCode,
      table.year,
      table.position,
    ),
    index("papers_owner_created_idx").on(table.ownerAccountId, table.createdAt),
    check("papers_origin", sql`${table.origin} in ('admin','user')`),
    check("papers_review_status", sql`${table.reviewStatus} in ('pending','approved','rejected')`),
    check(
      "papers_review",
      sql`(${table.origin}='admin' and ${table.reviewStatus}='approved') or (${table.origin}='user' and ${table.rightsConfirmedAt} is not null and ((${table.reviewStatus}='pending' and ${table.reviewedAt} is null and ${table.reviewerId} is null) or (${table.reviewStatus}='approved' and ${table.reviewedAt} is not null and ${table.reviewerId} is not null) or (${table.reviewStatus}='rejected' and ${table.reviewedAt} is not null and ${table.reviewerId} is not null and ${table.reviewReason} is not null and length(btrim(${table.reviewReason})) between 1 and 500)))`,
    ),
    check(
      "papers_review_reason",
      sql`${table.reviewReason} is null or length(btrim(${table.reviewReason})) between 1 and 500`,
    ),
    check("papers_review_reason_absent", sql`${table.reviewStatus}='rejected' or ${table.reviewReason} is null`),
    check("papers_listed", sql`not ${table.listed} or ${table.reviewStatus}='approved'`),
  ],
).enableRLS()

/** 试卷中的一道题；题号在同一试卷内唯一。 */
export const paperQuestions = pgTable(
  "paper_questions",
  {
    id: uuid().defaultRandom().primaryKey(),
    paperId: uuid("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    type: text().notNull(),
    score: integer(),
    topics: text("topics").array(),
    stemMarkdown: text("stem_markdown").notNull(),
    options: jsonb(),
    answerMarkdown: text("answer_markdown").notNull(),
    analysisMarkdown: text("analysis_markdown"),
  },
  (table) => [uniqueIndex("paper_questions_paper_number_unique").on(table.paperId, table.number)],
).enableRLS()
