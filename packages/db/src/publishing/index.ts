import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { accounts } from "../accounts"
/** 服务端持有发布计划；客户端不能自行指定对象 key 或变更上架状态。 */
export const lessonPublications = pgTable("lesson_publications", {
  id: uuid().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  document: jsonb().notNull(),
  contentHash: text("content_hash").notNull(),
  baseHash: text("base_hash"),
  oldKeys: jsonb("old_keys").notNull().default([]),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS()
