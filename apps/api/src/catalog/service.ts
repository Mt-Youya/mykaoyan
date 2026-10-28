import { Inject, Injectable } from "@nestjs/common"
import { and, asc, eq, inArray } from "drizzle-orm"
import { chapters, courses, handouts, lessons } from "@mykaoyan/db"
import { DatabaseService } from "../database"
import type { Database } from "../database"

/** 课程卡片：访客按科目浏览时看到的最少信息。 */
export type CourseSummary = { slug: string; title: string; summary: string }

/** 讲列表项：章内按顺序排列。 */
export type LessonSummary = { slug: string; title: string; videoKey: string; subtitleKey: string | null }

/** 课程详情：课程本身加按顺序排列的章与讲。 */
export type CourseDetail = CourseSummary & {
  chapters: { title: string; lessons: LessonSummary[] }[]
}

/** 讲义列表项。 */
export type HandoutSummary = { slug: string; title: string }

/** 讲义详情。 */
export type HandoutDetail = HandoutSummary & { markdown: string }

/** 讲详情：讲稿与视频对象 key。 */
export type LessonDetail = {
  slug: string
  title: string
  scriptMarkdown: string
  videoKey: string
  subtitleKey: string | null
  courseSlug: string
  courseTitle: string
  chapterTitle: string
}

/**
 * 课程内容的只读查询。
 *
 * 访客只能看到「课程、章、讲」整条链都上架的内容：任一级下架，其下内容对访客不可见。
 */
@Injectable()
export class CatalogService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private get db(): Database {
    return this.database.db
  }

  async listCourses(subjectCode: string): Promise<CourseSummary[]> {
    return this.db
      .select({ slug: courses.slug, title: courses.title, summary: courses.summary })
      .from(courses)
      .where(and(eq(courses.listed, true), eq(courses.subjectCode, subjectCode)))
      .orderBy(asc(courses.position))
  }

  async getCourse(slug: string): Promise<CourseDetail | undefined> {
    const [course] = await this.db
      .select({ slug: courses.slug, title: courses.title, summary: courses.summary, id: courses.id })
      .from(courses)
      .where(and(eq(courses.listed, true), eq(courses.slug, slug)))
      .limit(1)
    if (!course) return undefined

    const chapterRows = await this.db
      .select({ id: chapters.id, title: chapters.title })
      .from(chapters)
      .where(and(eq(chapters.listed, true), eq(chapters.courseId, course.id)))
      .orderBy(asc(chapters.position))

    const chapterIds = chapterRows.map((chapter) => chapter.id)
    const lessonRows = chapterIds.length
      ? await this.db
          .select({
            chapterId: lessons.chapterId,
            slug: lessons.slug,
            title: lessons.title,
            videoKey: lessons.videoKey,
            subtitleKey: lessons.subtitleKey,
          })
          .from(lessons)
          .where(and(eq(lessons.listed, true), inArray(lessons.chapterId, chapterIds)))
          .orderBy(asc(lessons.position))
      : []

    return {
      slug: course.slug,
      title: course.title,
      summary: course.summary,
      chapters: chapterRows.map((chapter) => ({
        title: chapter.title,
        lessons: lessonRows
          .filter((lesson) => lesson.chapterId === chapter.id)
          .map(({ slug: lessonSlug, title, videoKey, subtitleKey }) => ({
            slug: lessonSlug,
            title,
            videoKey,
            subtitleKey,
          })),
      })),
    }
  }

  async getLesson(slug: string): Promise<LessonDetail | undefined> {
    const [row] = await this.db
      .select({
        slug: lessons.slug,
        title: lessons.title,
        scriptMarkdown: lessons.scriptMarkdown,
        videoKey: lessons.videoKey,
        subtitleKey: lessons.subtitleKey,
        chapterTitle: chapters.title,
        courseSlug: courses.slug,
        courseTitle: courses.title,
      })
      .from(lessons)
      .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
      .innerJoin(courses, eq(courses.id, chapters.courseId))
      .where(and(eq(lessons.listed, true), eq(chapters.listed, true), eq(courses.listed, true), eq(lessons.slug, slug)))
      .limit(1)
    return row
  }

  async listHandouts(subjectCode: string): Promise<HandoutSummary[]> {
    return this.db
      .select({ slug: handouts.slug, title: handouts.title })
      .from(handouts)
      .where(and(eq(handouts.listed, true), eq(handouts.subjectCode, subjectCode)))
      .orderBy(asc(handouts.position))
  }

  async getHandout(slug: string): Promise<HandoutDetail | undefined> {
    const [row] = await this.db
      .select({ slug: handouts.slug, title: handouts.title, markdown: handouts.markdown })
      .from(handouts)
      .where(and(eq(handouts.listed, true), eq(handouts.slug, slug)))
      .limit(1)
    return row
  }
}

/** 课程只读查询的注入标记：配置数据库时是 `CatalogService`，未配置时是空实现。 */
export const CATALOG_READER = Symbol("catalog-reader")

export type CatalogReader = Pick<
  CatalogService,
  "listCourses" | "getCourse" | "getLesson" | "listHandouts" | "getHandout"
>
