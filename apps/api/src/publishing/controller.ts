import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from "@nestjs/common"
import { z } from "zod"

import { CurrentSession } from "../auth"
import type { AuthSession } from "../auth"
import { PublisherGuard } from "./guard"
import { PublishingService } from "./service"
@Controller("v1/publish")
@UseGuards(PublisherGuard)
export class PublishingController {
  constructor(@Inject(PublishingService) private service: PublishingService) {}
  @Post("prepare") prepare(@CurrentSession() session: AuthSession, @Body() body: unknown) {
    return this.service.prepare(session.user, body)
  }
  @Post(":id/complete") complete(@CurrentSession() session: AuthSession, @Param("id") id: string) {
    if (!z.uuid().safeParse(id).success) throw new BadRequestException("发布计划标识无效")
    return this.service.complete(session.user, id)
  }
  @Get("lessons/:slug") read(@CurrentSession() session: AuthSession, @Param("slug") slug: string) {
    return this.service.read(session.user, slug)
  }
  @Put("handouts/:slug") publishHandout(
    @CurrentSession() session: AuthSession,
    @Param("slug") slug: string,
    @Body() body: unknown,
  ) {
    return this.service.publishHandout(session.user, slug, body)
  }
}
