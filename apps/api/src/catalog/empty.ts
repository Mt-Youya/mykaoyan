import { Injectable, Module } from "@nestjs/common"
import { CatalogController } from "./controller"
import { CATALOG_READER } from "./service"
import type { CatalogReader, CourseDetail, CourseSummary, HandoutDetail, HandoutSummary, LessonDetail } from "./service"

/**
 * 本地未配置数据库时的只读空实现：接口形状不变，内容为空。
 *
 * 只在未设置 `DATABASE_URL` 时装配（生产环境必须配置数据库）；前端拿到空列表，
 * 显示空状态，而不是 404/500。
 */
@Injectable()
export class EmptyCatalogReader implements CatalogReader {
  async listCourses(): Promise<CourseSummary[]> {
    return []
  }

  async getCourse(): Promise<CourseDetail | undefined> {
    return undefined
  }

  async getLesson(): Promise<LessonDetail | undefined> {
    return undefined
  }

  async listHandouts(): Promise<HandoutSummary[]> {
    return []
  }

  async getHandout(): Promise<HandoutDetail | undefined> {
    return undefined
  }
}

/** 无数据库模式下的课程、讲义公开只读接口。 */
@Module({
  controllers: [CatalogController],
  providers: [{ provide: CATALOG_READER, useClass: EmptyCatalogReader }],
})
export class CatalogEmptyModule {}
