import { sql } from "drizzle-orm"
import { check, foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

import { accounts } from "../accounts"
import { lessons } from "../catalog"
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
