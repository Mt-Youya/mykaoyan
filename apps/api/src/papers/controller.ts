import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common"

import { subjectCodeSchema } from "@mykaoyan/core"

import { SessionGuard, CurrentSession } from "../auth"
import type { AuthSession } from "../auth"
import { PapersService } from "./service"

/** 公开试卷查询：题面不含答案；答案接口需要登录，且仅会员或试卷上传者可见。 */
@Controller()
export class PapersController {
  constructor(@Inject(PapersService) private readonly papers: PapersService) {}

  @Get("papers")
  async list(@Query("subject") subject: string | undefined) {
    const parsed = subjectCodeSchema.safeParse(subject)
    if (!parsed.success) throw new BadRequestException("subject 必须是三位考试科目代码")
    return this.papers.list(parsed.data)
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
