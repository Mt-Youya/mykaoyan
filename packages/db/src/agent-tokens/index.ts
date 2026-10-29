import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { accounts } from "../accounts"

/**
 * Agent 令牌：考生给自己 agent 用的长期凭证（工单 11）。
 *
 * 明文只在创建时返回一次；库里只存 SHA-256 哈希与末 4 位，列表页据此展示。
 * 每张表都开启 RLS 且不建策略，迁移里再显式 REVOKE anon/authenticated。
 */
export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: uuid().defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** 考生起的名字，例如「Codex 会话」；仅用于列表区分。 */
    scope: text().notNull().default("progress"),
    name: text().notNull(),
    /** 令牌明文的 SHA-256 十六进制；明文不落库。 */
    tokenHash: text("token_hash").notNull(),
    /** 明文末 4 位，方便考生认出是哪一枚。 */
    last4: text("last4").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** 最近一次成功使用时间；从未使用为 null。 */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    /** 吊销时间；非 null 即不再可用。 */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("agent_tokens_token_hash_unique").on(table.tokenHash),
    index("agent_tokens_account_created_idx").on(table.accountId, table.createdAt),
  ]
).enableRLS()
