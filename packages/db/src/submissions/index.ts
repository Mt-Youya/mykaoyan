import { sql } from "drizzle-orm"
import { boolean, check, doublePrecision, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { accounts } from "../accounts"
export const submissions = pgTable(
  "submissions",
  {
    id: uuid().primaryKey(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    title: text().notNull(),
    summary: text().notNull(),
    subjectCode: text("subject_code").notNull(),
    topicId: text("topic_id"),
    size: integer().notNull(),
    duration: doublePrecision().notNull(),
    fingerprint: text().notNull(),
    objectKey: text("object_key").notNull().unique(),
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
    check("submissions_state", sql`${t.status} in ('uploading','pending','approved','rejected')`),
    check(
      "submissions_visibility",
      sql`not ${t.listed} or (${t.status}='approved' and ${t.deletedAt} is null and ${t.deleteMarkedAt} is null)`
    ),
    check("submissions_limits", sql`${t.size}>0 and ${t.size}<=500000000 and ${t.duration}>0 and ${t.duration}<=1800`),
    check(
      "submissions_review",
      sql`(${t.status} in ('uploading','pending') and ${t.reviewedAt} is null) or (${t.status} in ('approved','rejected') and ${t.reviewedAt} is not null and (${t.status}<>'rejected' or length(trim(${t.reason})) between 1 and 500))`
    ),
  ]
).enableRLS()
