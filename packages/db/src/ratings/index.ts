import { sql } from "drizzle-orm"
import { check, index, integer, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core"
import { accounts } from "../accounts"
import { submissions } from "../submissions"
export const submissionRatings = pgTable(
  "submission_ratings",
  {
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    stars: integer().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.submissionId, t.accountId] }),
    index("submission_ratings_account_idx").on(t.accountId),
    check("submission_ratings_stars", sql`${t.stars} between 1 and 5`),
  ]
).enableRLS()
