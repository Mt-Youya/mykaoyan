import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * 课程：一个考试科目下按顺序排列的一组章。
 *
 * 内容字段（标题、摘要）与上架状态（`listed`）分开存：重新发布内容不会改动上架状态。
 */
export const courses = pgTable(
  "courses",
  {
    id: uuid().defaultRandom().primaryKey(),
    subjectCode: text("subject_code").notNull(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    summary: text().notNull(),
    position: integer().notNull(),
    listed: boolean().notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("courses_subject_position_idx").on(table.subjectCode, table.position)],
).enableRLS()

/** 章：课程中的一个单元。 */
export const chapters = pgTable(
  "chapters",
  {
    id: uuid().defaultRandom().primaryKey(),
    publishKey: text("publish_key").unique(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text().notNull(),
    position: integer().notNull(),
    listed: boolean().notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("chapters_course_position_idx").on(table.courseId, table.position)],
).enableRLS()

/** 讲：内容发布的最小单位，一个视频加上字幕和讲稿。 */
export const lessons = pgTable(
  "lessons",
  {
    id: uuid().defaultRandom().primaryKey(),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    slug: text().notNull().unique(),
    title: text().notNull(),
    position: integer().notNull(),
    videoKey: text("video_key").notNull(),
    subtitleKey: text("subtitle_key"),
    scriptMarkdown: text("script_markdown").notNull(),
    contentHash: text("content_hash"),
    contentVersion: integer("content_version").notNull().default(0),
    listed: boolean().notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("lessons_chapter_position_idx").on(table.chapterId, table.position)],
).enableRLS()

/** 讲义：不带视频、单独发布的 Markdown 文章。 */
export const handouts = pgTable(
  "handouts",
  {
    id: uuid().defaultRandom().primaryKey(),
    subjectCode: text("subject_code").notNull(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    markdown: text().notNull(),
    position: integer().notNull(),
    listed: boolean().notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("handouts_subject_position_idx").on(table.subjectCode, table.position)],
).enableRLS()
