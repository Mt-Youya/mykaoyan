import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { accounts } from "../accounts"

/**
 * 试卷：按考试科目与年份整理的一整套试题。
 *
 * 题面公开；答案与解析只经会员或试卷上传者的答案接口读取，不进入公开接口与页面。
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
    position: integer().notNull(),
    listed: boolean().notNull().default(false),
    ownerAccountId: uuid("owner_account_id").references(() => accounts.id, { onDelete: "set null" }),
    contentHash: text("content_hash"),
    contentVersion: integer("content_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("papers_subject_year_position_idx").on(table.subjectCode, table.year, table.position)],
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
