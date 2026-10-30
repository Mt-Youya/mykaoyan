import { randomUUID } from "node:crypto"

import { Body, Controller, Get, Header, Inject, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common"
import { fromNodeHeaders } from "better-auth/node"

import { AUTH, CurrentSession, SessionGuard } from "../auth"
import type { Auth, AuthSession } from "../auth"
import { SubmissionModeration } from "./moderation"
import { SubmissionsService } from "./service"
import { SubmissionUploads } from "./uploads"
@Controller("submissions")
export class SubmissionsController {
  constructor(
    @Inject(SubmissionsService) private service: SubmissionsService,
    @Inject(SubmissionUploads) private uploads: SubmissionUploads,
    @Inject(AUTH) private auth: Auth,
  ) {}
  @Get() @Header("Cache-Control", "no-store") list(
    @Query("subject") subject = "",
    @Query("page") page = "0",
    @Query("topic") topic = "",
  ) {
    return this.service.list(subject, Number(page), topic)
  }
  @Get("mine") @UseGuards(SessionGuard) @Header("Cache-Control", "no-store") mine(
    @CurrentSession() s: AuthSession,
    @Query("page") page = "0",
  ) {
    return this.service.mine(s.user.id, Number(page))
  }
  @Post("uploads") @UseGuards(SessionGuard) start(@CurrentSession() s: AuthSession, @Body() body: unknown) {
    return this.uploads.start(s.user.id, body)
  }
  @Get(":id/upload") @UseGuards(SessionGuard) @Header("Cache-Control", "no-store") resume(
    @CurrentSession() s: AuthSession,
    @Param("id") id: string,
  ) {
    return this.uploads.resume(s.user.id, id)
  }
  @Post(":id/parts/:number") @UseGuards(SessionGuard) sign(
    @CurrentSession() s: AuthSession,
    @Param("id") id: string,
    @Param("number") number: string,
  ) {
    return this.uploads.sign(s.user.id, id, Number(number))
  }
  @Post(":id/complete") @UseGuards(SessionGuard) finish(@CurrentSession() s: AuthSession, @Param("id") id: string) {
    return this.uploads.finish(s.user.id, id)
  }
  @Post(":id/playback-token") @Header("Cache-Control", "no-store") async token(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: { headers: Record<string, string | string[] | undefined> },
  ) {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) }).catch(() => null)
    const actor = session ? { id: session.user.id, role: session.user.role ?? "account" } : null
    return this.service.token(id, actor, actor?.id ?? randomUUID(), body)
  }
}
@Controller("admin/submissions")
@UseGuards(SessionGuard)
export class AdminSubmissionsController {
  constructor(
    @Inject(SubmissionsService) private service: SubmissionsService,
    @Inject(SubmissionModeration) private moderation: SubmissionModeration,
  ) {}
  @Get() @Header("Cache-Control", "no-store") list(@CurrentSession() s: AuthSession, @Query("page") page = "0") {
    return this.service.adminList(s.user, Number(page))
  }
  @Post("cleanup") cleanup(@CurrentSession() s: AuthSession) {
    return this.moderation.cleanupAsAdmin(s.user)
  }
  @Post(":id/review") review(@CurrentSession() s: AuthSession, @Param("id") id: string, @Body() body: unknown) {
    return this.moderation.review(s.user, id, body)
  }
  @Put(":id/listing") listing(@CurrentSession() s: AuthSession, @Param("id") id: string, @Body() body: unknown) {
    return this.moderation.listing(s.user, id, body)
  }
}
