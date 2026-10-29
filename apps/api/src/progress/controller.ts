import { Body, Controller, Get, Headers, HttpException, HttpStatus, Inject, Put, Res, UseGuards } from "@nestjs/common"
import { AgentTokenGuard } from "../agent-tokens"
import { CurrentSession } from "../auth"
import type { AuthSession } from "../auth"
import { ProgressService } from "./service"

type HeaderResponse = { setHeader(name: string, value: string): void }

/** 进度文档的整个读写面都要求登录或有效 Agent 令牌；不能通过 ID 参数访问别人的记录。 */
@Controller("v1/progress")
@UseGuards(AgentTokenGuard)
export class ProgressController {
  constructor(@Inject(ProgressService) private readonly progress: ProgressService) {}

  @Get()
  async read(@CurrentSession() session: AuthSession, @Res({ passthrough: true }) response: HeaderResponse) {
    const result = await this.progress.read(session.user.id)
    response.setHeader("ETag", result.etag)
    response.setHeader("Cache-Control", "no-store")
    return result.document
  }

  @Put()
  async replace(
    @CurrentSession() session: AuthSession,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    if (!ifMatch) throw new HttpException("缺少 If-Match", HttpStatus.PRECONDITION_REQUIRED)
    const result = await this.progress.replace(session.user.id, ifMatch, body)
    response.setHeader("ETag", result.etag)
    response.setHeader("Cache-Control", "no-store")
    return result
  }

  @Get("revisions")
  listRevisions(@CurrentSession() session: AuthSession) {
    return this.progress.listRevisions(session.user.id)
  }
}
