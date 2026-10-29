import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from "@nestjs/common"
import { z } from "zod"
import { CurrentSession, SessionGuard } from "../auth"
import type { AuthSession } from "../auth"
import { AgentTokensService } from "./service"

const createSchema = z
  .object({ name: z.string().trim().min(1).max(40), scope: z.enum(["progress", "publish"]).default("progress") })
  .strict()
const idSchema = z.string().uuid()

/** 令牌管理只认网页会话；Agent 令牌不能自己续命或创建新令牌。 */
@Controller("agent-tokens")
@UseGuards(SessionGuard)
export class AgentTokensController {
  constructor(@Inject(AgentTokensService) private readonly tokens: AgentTokensService) {}

  @Post()
  async create(@Body() body: unknown, @CurrentSession() session: AuthSession) {
    const parsed = createSchema.safeParse(body ?? {})
    if (!parsed.success) throw new BadRequestException("令牌名称需为 1–40 个字符")
    return this.tokens.create(session.user.id, parsed.data.name, parsed.data.scope)
  }

  @Get()
  list(@CurrentSession() session: AuthSession) {
    return this.tokens.list(session.user.id)
  }

  @Delete(":id")
  async revoke(@Param("id") id: string, @CurrentSession() session: AuthSession) {
    const parsed = idSchema.safeParse(id)
    if (!parsed.success) throw new BadRequestException("令牌 id 无效")
    await this.tokens.revoke(session.user.id, parsed.data)
    return { revoked: true }
  }
}
