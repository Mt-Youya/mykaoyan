import { Body, Controller, Delete, Get, Header, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common"
import { fromNodeHeaders } from "better-auth/node"

import { AUTH, CurrentSession, SessionGuard } from "../auth"
import type { Auth, AuthSession } from "../auth"
import { PaperCommentsService } from "./paper-service"
/**
 * 用户试卷评论：`papers/:slug/comments` 与 `papers/mine`、`papers/:slug` 路径段数不同，
 * 不会互相吞掉路由。公开读取带 `viewer`，只描述当前账号能否评论，不泄露账号编号。
 */
@Controller("papers/:slug/comments")
export class PaperCommentsController {
  constructor(
    @Inject(PaperCommentsService) private comments: PaperCommentsService,
    @Inject(AUTH) private auth: Auth,
  ) {}
  @Get() @Header("Cache-Control", "no-store") async list(
    @Param("slug") slug: string,
    @Query("page") page = "0",
    @Req() request: { headers: Record<string, string | string[] | undefined> },
  ) {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) }).catch(() => null)
    return this.comments.list(slug, Number(page), session?.user.id ?? null)
  }
  @Post() @UseGuards(SessionGuard) create(
    @CurrentSession() session: AuthSession,
    @Param("slug") slug: string,
    @Body() body: unknown,
  ) {
    return this.comments.create(session.user.id, slug, body)
  }
}
@Controller("admin/paper-comments")
@UseGuards(SessionGuard)
export class AdminPaperCommentsController {
  constructor(@Inject(PaperCommentsService) private comments: PaperCommentsService) {}
  @Get() @Header("Cache-Control", "no-store") list(
    @CurrentSession() session: AuthSession,
    @Query("page") page = "0",
    @Query("q") q: string | undefined,
    @Query("state") state: string | undefined,
  ) {
    return this.comments.listAdmin(session.user, Number(page), q, state)
  }
  @Delete(":id") remove(@CurrentSession() session: AuthSession, @Param("id") id: string, @Body() body: unknown) {
    return this.comments.remove(session.user, id, body)
  }
}
