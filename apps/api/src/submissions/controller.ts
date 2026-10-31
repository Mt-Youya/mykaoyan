import { randomUUID } from "node:crypto"

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common"
import { fromNodeHeaders } from "better-auth/node"

import { AUTH, CurrentSession, SessionGuard } from "../auth"
import type { Auth, AuthSession } from "../auth"
import type { Actor } from "./access"
import { SubmissionManuscripts } from "./manuscripts"
import { SubmissionModeration } from "./moderation"
import { SubmissionsService } from "./service"
import { SubmissionSubtitles } from "./subtitles"
import { SubmissionUploads } from "./uploads"
type HeaderResponse = { setHeader(name: string, value: string): void }
type RequestLike = { headers: Record<string, string | string[] | undefined> }
@Controller("submissions")
export class SubmissionsController {
  constructor(
    @Inject(SubmissionsService) private service: SubmissionsService,
    @Inject(SubmissionUploads) private uploads: SubmissionUploads,
    @Inject(SubmissionManuscripts) private manuscripts: SubmissionManuscripts,
    @Inject(SubmissionSubtitles) private subtitles: SubmissionSubtitles,
    @Inject(AUTH) private auth: Auth,
  ) {}
  private async actor(request: RequestLike): Promise<Actor | null> {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) }).catch(() => null)
    return session ? { id: session.user.id, role: session.user.role ?? "account" } : null
  }
  @Get() @Header("Cache-Control", "no-store") list(
    @Query("subject") subject = "",
    @Query("page") page = "0",
    @Query("topic") topic = "",
    @Query("kind") kind = "",
  ) {
    return this.service.list(subject, Number(page), topic, kind)
  }
  @Get("mine") @UseGuards(SessionGuard) @Header("Cache-Control", "no-store") mine(
    @CurrentSession() s: AuthSession,
    @Query("page") page = "0",
  ) {
    return this.service.mine(s.user.id, Number(page))
  }
  @Post("manuscripts") @UseGuards(SessionGuard) @Header("Cache-Control", "no-store") manuscript(
    @CurrentSession() s: AuthSession,
    @Body() body: unknown,
  ) {
    return this.manuscripts.create(s.user.id, body)
  }
  @Get(":id/manuscript") @Header("Cache-Control", "no-store") async manuscriptText(
    @Param("id") id: string,
    @Req() request: RequestLike,
  ) {
    return this.manuscripts.read(id, await this.actor(request))
  }
  @Put(":id/subtitles") @UseGuards(SessionGuard) @Header("Cache-Control", "no-store") putSubtitles(
    @CurrentSession() s: AuthSession,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.subtitles.put(s.user.id, id, body)
  }
  @Delete(":id/subtitles/:language") @UseGuards(SessionGuard) @Header("Cache-Control", "no-store") deleteSubtitle(
    @CurrentSession() s: AuthSession,
    @Param("id") id: string,
    @Param("language") language: string,
  ) {
    return this.subtitles.remove(s.user.id, id, language)
  }
  @Get(":id/subtitles/:language") async subtitle(
    @Param("id") id: string,
    @Param("language") language: string,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const subtitle = await this.subtitles.read(id, language, await this.actor(request))
    response.setHeader("Content-Type", "text/vtt; charset=utf-8")
    response.setHeader("Cache-Control", "no-store")
    response.setHeader("X-Content-Type-Options", "nosniff")
    return subtitle.vtt_content
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
    @Req() request: RequestLike,
  ) {
    const actor = await this.actor(request)
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
