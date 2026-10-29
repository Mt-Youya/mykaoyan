import { Inject, Injectable, UnauthorizedException } from "@nestjs/common"
import type { CanActivate, ExecutionContext } from "@nestjs/common"
import { fromNodeHeaders } from "better-auth/node"
import { AUTH } from "../auth"
import type { Auth, AuthSession, AuthenticatedRequest } from "../auth"
import { appendSetCookies } from "../auth/http"
import type { NodeResponseLike } from "../auth/http"
import { AgentTokensService } from "./service"

/**
 * `/api/v1/*` 的认证：优先网页会话，其次 `Authorization: Bearer <Agent 令牌>`。
 *
 * Bearer 分支只把账号挂到请求上，不建立网页会话；因此它不能用于 `/api/auth/*`、
 * 管理员接口或任何要求 role 的地方。会话分支保留 Set-Cookie 刷新透传。
 */
@Injectable()
export class AgentTokenGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(AgentTokensService) private readonly tokens: AgentTokensService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const result = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers), returnHeaders: true })
    if (result.response) {
      request.authSession = result.response as AuthSession
      appendSetCookies(context.switchToHttp().getResponse<NodeResponseLike>(), result.headers.getSetCookie())
      return true
    }

    const authorization = request.headers.authorization
    const header = Array.isArray(authorization) ? authorization[0] : authorization
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : ""
    if (!token) throw new UnauthorizedException("请先登录")

    const accountId = await this.tokens.verify(token)
    if (!accountId) throw new UnauthorizedException("令牌无效或已吊销")
    request.authSession = {
      session: { id: `agent-token:${accountId}`, userId: accountId, expiresAt: new Date(0) },
      user: { id: accountId, role: "account" },
    }
    return true
  }
}
