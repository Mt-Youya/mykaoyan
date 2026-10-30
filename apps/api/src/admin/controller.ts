import { BadRequestException, Body, Controller, Get, Inject, Param, Put, UseGuards } from "@nestjs/common"
import { z } from "zod"

import { CurrentSession, SessionGuard } from "../auth"
import type { AuthSession } from "../auth"
import { ListingService } from "./listing.service"
import type { ListingTarget } from "./listing.service"

const bodySchema = z.object({ listed: z.boolean() }).strict()

/** 上下架接口：访客 401（由 SessionGuard 返回），非管理员 403（由服务层返回）。 */
@Controller("admin")
@UseGuards(SessionGuard)
export class ListingController {
  constructor(@Inject(ListingService) private readonly listing: ListingService) {}

  /** 管理视图：全部讲与讲义，含未上架。 */
  @Get("content")
  async listAll(@CurrentSession() session: AuthSession) {
    return this.listing.listAll({ id: session.user.id, role: session.user.role })
  }

  @Put("lessons/:slug/listing")
  async setLessonListed(@Param("slug") slug: string, @Body() body: unknown, @CurrentSession() session: AuthSession) {
    return this.set(slug, "lesson", body, session)
  }

  @Put("handouts/:slug/listing")
  async setHandoutListed(@Param("slug") slug: string, @Body() body: unknown, @CurrentSession() session: AuthSession) {
    return this.set(slug, "handout", body, session)
  }

  private async set(slug: string, targetType: ListingTarget, body: unknown, session: AuthSession) {
    const parsed = bodySchema.safeParse(body ?? {})
    if (!parsed.success) throw new BadRequestException("listed 必须是布尔值")
    return this.listing.setListed(
      { id: session.user.id, role: session.user.role },
      { targetType, slug, listed: parsed.data.listed },
    )
  }
}
