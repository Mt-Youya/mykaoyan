import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, Query } from "@nestjs/common"
import { z } from "zod"

import { CATALOG_READER } from "./service"
import type { CatalogReader } from "./service"

/** 三位考试科目代码，例如 302、408。 */
const subjectCodeSchema = z.string().regex(/^\d{3}$/)

/** 已上架内容的公开查询；未上架一律按不存在处理。 */
@Controller()
export class CatalogController {
  constructor(@Inject(CATALOG_READER) private readonly catalog: CatalogReader) {}

  @Get("courses")
  async listCourses(@Query("subject") subject: string | undefined) {
    const parsed = subjectCodeSchema.safeParse(subject)
    if (!parsed.success) throw new BadRequestException("subject 必须是三位考试科目代码")
    return this.catalog.listCourses(parsed.data)
  }

  @Get("courses/:slug")
  async getCourse(@Param("slug") slug: string) {
    const course = await this.catalog.getCourse(slug)
    if (!course) throw new NotFoundException("课程不存在")
    return course
  }

  @Get("lessons/:slug")
  async getLesson(@Param("slug") slug: string) {
    const lesson = await this.catalog.getLesson(slug)
    if (!lesson) throw new NotFoundException("讲不存在")
    return lesson
  }

  @Get("handouts")
  async listHandouts(@Query("subject") subject: string | undefined) {
    const parsed = subjectCodeSchema.safeParse(subject)
    if (!parsed.success) throw new BadRequestException("subject 必须是三位考试科目代码")
    return this.catalog.listHandouts(parsed.data)
  }

  @Get("handouts/:slug")
  async getHandout(@Param("slug") slug: string) {
    const handout = await this.catalog.getHandout(slug)
    if (!handout) throw new NotFoundException("讲义不存在")
    return handout
  }
}
