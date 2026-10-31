import { Body, Controller, Delete, Get, Header, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common"
import { fromNodeHeaders } from "better-auth/node"

import { AUTH, CurrentSession, SessionGuard } from "../auth"
import type { Auth, AuthSession } from "../auth"
import { SubmissionCommentsService } from "./submission-service"
@Controller("submissions/:id/comments")
export class SubmissionCommentsController {
  constructor(
    @Inject(SubmissionCommentsService) private comments: SubmissionCommentsService,
    @Inject(AUTH) private auth: Auth,
  ) {}
  @Get() @Header("Cache-Control", "no-store") async list(
    @Param("id") id: string,
    @Query("page") page = "0",
    @Req() request: { headers: Record<string, string | string[] | undefined> },
  ) {
    // 公开读取；登录时附带当前账号能否评论（会员或投稿上传者本人），不返回账号编号。
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) }).catch(() => null)
    return this.comments.list(id, Number(page), session?.user.id ?? null)
  }
  @Post() @UseGuards(SessionGuard) create(
    @CurrentSession() session: AuthSession,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.comments.create(session.user.id, id, body)
  }
}
@Controller("admin/submission-comments")
@UseGuards(SessionGuard)
export class AdminSubmissionCommentsController {
  constructor(@Inject(SubmissionCommentsService) private comments: SubmissionCommentsService) {}
  @Get() @Header("Cache-Control", "no-store") list(@CurrentSession() session: AuthSession, @Query("page") page = "0") {
    return this.comments.listAdmin(session.user, Number(page))
  }
  @Delete(":id") remove(@CurrentSession() session: AuthSession, @Param("id") id: string, @Body() body: unknown) {
    return this.comments.remove(session.user, id, body)
  }
}
