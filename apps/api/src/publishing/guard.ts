import { Inject, Injectable, UnauthorizedException } from "@nestjs/common"
import type { CanActivate, ExecutionContext } from "@nestjs/common"
import { AgentTokensService } from "../agent-tokens"
import type { AuthenticatedRequest } from "../auth"
@Injectable()
export class PublisherGuard implements CanActivate {
  constructor(@Inject(AgentTokensService) private tokens: AgentTokensService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const value = request.headers.authorization
    const header = Array.isArray(value) ? value[0] : value
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : ""
    const id = token ? await this.tokens.verifyPublisher(token) : null
    if (!id) throw new UnauthorizedException("需要有效的管理员发布令牌")
    request.authSession = {
      session: { id: `publisher:${id}`, userId: id, expiresAt: new Date(0) },
      user: { id, role: "admin" },
    }
    return true
  }
}
