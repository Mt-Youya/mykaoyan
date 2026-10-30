import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { asc, eq } from "drizzle-orm"

import { chapters, courses, handouts, lessons, listingChanges, papers } from "@mykaoyan/db"

import { DatabaseService } from "../database"
import type { Database } from "../database"

/** 可上下架的内容类型。 */
export type ListingTarget = "lesson" | "handout" | "paper"

export type ListingChange = { targetType: ListingTarget; slug: string; listed: boolean }

/**
 * 上下架：只有管理员能改变上架状态，每次操作都留下「谁、何时、改成什么」的记录。
 *
 * 权限判断在服务层：调用方只传会话里的 actor 与角色，不自己判断角色。
 */
@Injectable()
export class ListingService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private get db(): Database {
    return this.database.db
  }

  /** 管理视图：列出全部讲、讲义与试卷，含未上架内容。只有管理员能读。 */
  async listAll(actor: { id: string; role: string }) {
    if (actor.role !== "admin") throw new ForbiddenException("只有管理员能查看全部内容")
    const [lessonRows, handoutRows, paperRows] = await Promise.all([
      this.db
        .select({
          slug: lessons.slug,
          title: lessons.title,
          listed: lessons.listed,
          chapterTitle: chapters.title,
          courseSlug: courses.slug,
          courseTitle: courses.title,
        })
        .from(lessons)
        .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
        .innerJoin(courses, eq(courses.id, chapters.courseId))
        .orderBy(asc(courses.position), asc(chapters.position), asc(lessons.position)),
      this.db
        .select({
          slug: handouts.slug,
          title: handouts.title,
          listed: handouts.listed,
          subjectCode: handouts.subjectCode,
        })
        .from(handouts)
        .orderBy(asc(handouts.subjectCode), asc(handouts.position)),
      this.db
        .select({
          slug: papers.slug,
          title: papers.title,
          listed: papers.listed,
          subjectCode: papers.subjectCode,
          year: papers.year,
        })
        .from(papers)
        .orderBy(asc(papers.subjectCode), asc(papers.year), asc(papers.position)),
    ])
    return { lessons: lessonRows, handouts: handoutRows, papers: paperRows }
  }

  async setListed(actor: { id: string; role: string }, change: ListingChange) {
    if (actor.role !== "admin") throw new ForbiddenException("只有管理员能改变上架状态")

    await this.db.transaction(async (tx) => {
      const now = new Date()
      let targetId: string | undefined
      if (change.targetType === "lesson")
        targetId = (
          await tx
            .update(lessons)
            .set({ listed: change.listed, updatedAt: now })
            .where(eq(lessons.slug, change.slug))
            .returning({ id: lessons.id })
        )[0]?.id
      else if (change.targetType === "handout")
        targetId = (
          await tx
            .update(handouts)
            .set({ listed: change.listed, updatedAt: now })
            .where(eq(handouts.slug, change.slug))
            .returning({ id: handouts.id })
        )[0]?.id
      else
        targetId = (
          await tx
            .update(papers)
            .set({ listed: change.listed, updatedAt: now })
            .where(eq(papers.slug, change.slug))
            .returning({ id: papers.id })
        )[0]?.id

      if (!targetId) throw new NotFoundException("内容不存在")

      await tx.insert(listingChanges).values({
        targetType: change.targetType,
        targetId,
        listed: change.listed,
        actorId: actor.id,
      })
    })

    return { targetType: change.targetType, slug: change.slug, listed: change.listed }
  }
}
