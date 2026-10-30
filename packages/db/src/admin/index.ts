import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { accounts } from "../accounts"

/**
 * 上下架操作记录：谁、何时、把哪一条内容改成了什么状态。
 *
 * 只追加不修改；内容本身的上架状态在各自的 `listed` 列上。
 */
export const listingChanges = pgTable(
  "listing_changes",
  {
    id: uuid().defaultRandom().primaryKey(),
    /** 被操作内容的类型：lesson、handout 或 submission。 */
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    /** 操作之后的上下架状态：true 为上架，false 为下架。 */
    listed: boolean().notNull(),
    /** 执行操作的管理员账号。 */
    actorId: uuid("actor_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("listing_changes_target_idx").on(table.targetType, table.targetId, table.createdAt)]
).enableRLS()
