import { Body, Controller, Delete, Get, Header, Inject, Param, Post, Put, Query, Res, UseGuards } from "@nestjs/common"
import { CurrentSession, SessionGuard } from "../auth"
import type { AuthSession } from "../auth"
import { CommentsService } from "./service"
@Controller("lessons/:slug/comments")
export class CommentsController {
  constructor(@Inject(CommentsService) private comments: CommentsService) {}
  @Get() list(
    @Param("slug") slug: string,
    @Query("page") page = "0",
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }
  ) {
    response.setHeader("Cache-Control", "no-store")
    return this.comments.list(slug, Number(page))
  }
  @Post() @UseGuards(SessionGuard) create(
    @CurrentSession() session: AuthSession,
    @Param("slug") slug: string,
    @Body() body: unknown
  ) {
    return this.comments.create(session.user.id, slug, body)
  }
}
@Controller("admin/comments")
@UseGuards(SessionGuard)
export class AdminCommentsController {
  constructor(@Inject(CommentsService) private comments: CommentsService) {}
  @Get() @Header("Cache-Control", "no-store") list(@CurrentSession() session: AuthSession, @Query("page") page = "0") {
    return this.comments.listAdmin(session.user, Number(page))
  }
  @Get("keywords") @Header("Cache-Control", "no-store") keywords(@CurrentSession() session: AuthSession) {
    return this.comments.keywords(session.user)
  }
  @Put("keywords") setKeywords(@CurrentSession() session: AuthSession, @Body() body: unknown) {
    return this.comments.setKeywords(session.user, body)
  }
  @Delete(":id") remove(@CurrentSession() session: AuthSession, @Param("id") id: string, @Body() body: unknown) {
    return this.comments.remove(session.user, id, body)
  }
}
