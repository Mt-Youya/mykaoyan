import { sql } from "drizzle-orm"
import { check, foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

import { accounts } from "../accounts"
import { lessons } from "../catalog"
import { papers } from "../papers"
import { submissions } from "../submissions"
export const comments = pgTable(
  "comments",
  {
    id: uuid().defaultRandom().primaryKey(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    parentId: uuid("parent_id"),
    body: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    unique("comments_id_lesson_unique").on(t.id, t.lessonId),
    foreignKey({
      name: "comments_parent_lesson_fk",
      columns: [t.parentId, t.lessonId],
      foreignColumns: [t.id, t.lessonId],
    }).onDelete("cascade"),
    check("comments_not_self_parent", sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
    check("comments_body_length", sql`length(btrim(${t.body})) between 1 and 2000`),
    index("comments_lesson_created_idx").on(t.lessonId, t.createdAt, t.id),
  ],
).enableRLS()
export const commentDeletions = pgTable(
  "comment_deletions",
  {
    id: uuid().defaultRandom().primaryKey(),
    commentId: uuid("comment_id")
      .notNull()
      .unique()
      .references(() => comments.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => accounts.id, { onDelete: "set null" }),
    reason: text().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("comment_deletions_reason", sql`length(btrim(${t.reason})) between 1 and 500`)],
).enableRLS()
export const commentKeywords = pgTable("comment_keywords", { word: text().primaryKey() }).enableRLS()
/** 投稿下的评论；父评论必须同一投稿，两层结构与讲评论一致（不能回复回复由服务层校验）。 */
export const submissionComments = pgTable(
  "submission_comments",
  {
    id: uuid().defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    parentId: uuid("parent_id"),
    body: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    unique("submission_comments_id_submission_unique").on(t.id, t.submissionId),
    foreignKey({
      name: "submission_comments_parent_submission_fk",
      columns: [t.parentId, t.submissionId],
      foreignColumns: [t.id, t.submissionId],
    }).onDelete("cascade"),
    check("submission_comments_not_self_parent", sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
    check("submission_comments_body_length", sql`length(btrim(${t.body})) between 1 and 2000`),
    index("submission_comments_submission_created_idx").on(t.submissionId, t.createdAt, t.id),
  ],
).enableRLS()
export const submissionCommentDeletions = pgTable(
  "submission_comment_deletions",
  {
    id: uuid().defaultRandom().primaryKey(),
    commentId: uuid("comment_id")
      .notNull()
      .unique()
      .references(() => submissionComments.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => accounts.id, { onDelete: "set null" }),
    reason: text().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("submission_comment_deletions_reason", sql`length(btrim(${t.reason})) between 1 and 500`)],
).enableRLS()
/** 用户试卷下的评论；父评论必须同一试卷，结构与投稿评论一致（不能回复回复由服务层校验）。 */
export const paperComments = pgTable(
  "paper_comments",
  {
    id: uuid().defaultRandom().primaryKey(),
    paperId: uuid("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    parentId: uuid("parent_id"),
    body: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    unique("paper_comments_id_paper_unique").on(t.id, t.paperId),
    foreignKey({
      name: "paper_comments_parent_paper_fk",
      columns: [t.parentId, t.paperId],
      foreignColumns: [t.id, t.paperId],
    }).onDelete("cascade"),
    check("paper_comments_not_self_parent", sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
    check("paper_comments_body_length", sql`length(btrim(${t.body})) between 1 and 2000`),
    index("paper_comments_paper_created_idx").on(t.paperId, t.createdAt, t.id),
  ],
).enableRLS()
export const paperCommentDeletions = pgTable(
  "paper_comment_deletions",
  {
    id: uuid().defaultRandom().primaryKey(),
    commentId: uuid("comment_id")
      .notNull()
      .unique()
      .references(() => paperComments.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => accounts.id, { onDelete: "set null" }),
    reason: text().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("paper_comment_deletions_reason", sql`length(btrim(${t.reason})) between 1 and 500`)],
).enableRLS()
