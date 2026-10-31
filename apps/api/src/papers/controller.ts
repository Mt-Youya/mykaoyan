import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common"

import { PAPER_ORIGINS, subjectCodeSchema } from "@mykaoyan/core"

import { CurrentSession, SessionGuard } from "../auth"
import type { AuthSession } from "../auth"
import { PapersService } from "./service"
import { UserPapersService } from "./user-papers.service"

/**
 * 公开试卷查询与用户试卷提交。
 *
 * 题面不含答案；答案接口需要登录，且仅会员、试卷上传者本人或管理员可见。
 * `papers/mine` 系列必须注册在 `papers/:slug` 之前，避免被动态段吞掉。
 */
@Controller()
export class PapersController {
  constructor(
    @Inject(PapersService) private readonly papers: PapersService,
    @Inject(UserPapersService) private readonly userPapers: UserPapersService,
  ) {}

  /** 登录即可提交用户试卷：写入即待审核、默认下架。 */
  @Post("papers/submissions")
  @UseGuards(SessionGuard)
  submit(@CurrentSession() session: AuthSession, @Body() body: unknown) {
    return this.userPapers.submit(session.user, body)
  }

  /** 我的用户试卷：任何状态可读，含驳回原因。 */
  @Get("papers/mine")
  @UseGuards(SessionGuard)
  @Header("Cache-Control", "no-store")
  mine(@CurrentSession() session: AuthSession, @Query("page") page = "0") {
    return this.userPapers.mine(session.user, page)
  }

  /** 本人试卷全文预览（含答案与解析），用于提交后与驳回后查看。 */
  @Get("papers/mine/:slug")
  @UseGuards(SessionGuard)
  @Header("Cache-Control", "no-store")
  mineOne(@CurrentSession() session: AuthSession, @Param("slug") slug: string) {
    return this.userPapers.mineOne(session.user, slug)
  }

  @Get("papers")
  async list(@Query("subject") subject: string | undefined, @Query("origin") origin: string | undefined) {
    const parsedSubject = subjectCodeSchema.safeParse(subject)
    if (!parsedSubject.success) throw new BadRequestException("subject 必须是三位考试科目代码")
    if (origin !== undefined && !(PAPER_ORIGINS as readonly string[]).includes(origin))
      throw new BadRequestException("origin 只能是 admin 或 user")
    return this.papers.list(parsedSubject.data, origin === "user" ? "user" : "admin")
  }

  @Get("papers/:slug")
  async get(@Param("slug") slug: string) {
    const paper = await this.papers.get(slug)
    if (!paper) throw new NotFoundException("试卷不存在")
    return paper
  }

  @UseGuards(SessionGuard)
  @Header("Cache-Control", "no-store")
  @Get("papers/:slug/answers")
  async answers(@CurrentSession() session: AuthSession, @Param("slug") slug: string) {
    const paper = await this.papers.answersFor(session.user, slug)
    if (!paper) throw new NotFoundException("试卷不存在")
    return paper
  }
}
