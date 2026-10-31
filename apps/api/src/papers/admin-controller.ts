import { Body, Controller, Get, Header, Inject, Param, Post, Query, UseGuards } from "@nestjs/common"

import { CurrentSession, SessionGuard } from "../auth"
import type { AuthSession } from "../auth"
import { PaperModerationService } from "./moderation.service"

/** 用户试卷审核：待审列表、含答案预览与通过/驳回。权限在服务层回库复核。 */
@Controller("admin/papers")
@UseGuards(SessionGuard)
export class AdminPapersController {
  constructor(@Inject(PaperModerationService) private readonly moderation: PaperModerationService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  list(@CurrentSession() session: AuthSession, @Query("status") status: string | undefined, @Query("page") page = "0") {
    return this.moderation.list(session.user, status, page)
  }

  @Get(":slug")
  @Header("Cache-Control", "no-store")
  detail(@CurrentSession() session: AuthSession, @Param("slug") slug: string) {
    return this.moderation.detail(session.user, slug)
  }

  @Post(":slug/review")
  review(@CurrentSession() session: AuthSession, @Param("slug") slug: string, @Body() body: unknown) {
    return this.moderation.review(session.user, slug, body)
  }
}
