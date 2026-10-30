import { sql } from "drizzle-orm"
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { accounts } from "../accounts"
export const redemptionCodes = pgTable(
  "redemption_codes",
  {
    id: uuid().defaultRandom().primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    last4: text().notNull(),
    createdBy: uuid("created_by").references(() => accounts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    redeemedBy: uuid("redeemed_by").references(() => accounts.id, { onDelete: "set null" }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  },
  (t) => [index("redemption_codes_created_idx").on(t.createdAt, t.id)],
).enableRLS()
export const membershipPeriods = pgTable(
  "membership_periods",
  {
    id: uuid().defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    source: text().notNull(),
    reason: text(),
    actorId: uuid("actor_id").references(() => accounts.id, { onDelete: "set null" }),
    codeId: uuid("code_id")
      .unique()
      .references(() => redemptionCodes.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("membership_periods_account_end_idx").on(t.accountId, t.endsAt),
    check("membership_periods_dates", sql`${t.endsAt} > ${t.startsAt}`),
    check("membership_periods_source", sql`${t.source} in ('manual','code')`),
    check(
      "membership_periods_manual_reason",
      sql`${t.source} <> 'manual' or length(btrim(${t.reason})) > 0 and ${t.reason} is not null`,
    ),
  ],
).enableRLS()
