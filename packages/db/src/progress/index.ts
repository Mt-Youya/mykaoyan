import { index, integer, jsonb, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { accounts } from "../accounts/index"

/** 每个账号当前的一份学习进度文档；内容只由 API 服务层访问。 */
export const progressDocuments = pgTable(
  "progress_documents",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    document: jsonb().notNull(),
    revision: integer().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("progress_documents_updated_idx").on(table.updatedAt)]
).enableRLS()

/** 每次成功替换后的不可变快照；当前文档不在这里重复初始化。 */
export const progressRevisions = pgTable(
  "progress_revisions",
  {
    id: uuid().defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    revision: integer().notNull(),
    document: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("progress_revisions_account_revision_unique").on(table.accountId, table.revision),
    index("progress_revisions_account_created_idx").on(table.accountId, table.createdAt),
  ]
).enableRLS()
