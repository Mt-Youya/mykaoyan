import { createParamDecorator, Inject, Injectable, UnauthorizedException } from "@nestjs/common"
import type { CanActivate, ExecutionContext } from "@nestjs/common"
import { fromNodeHeaders } from "better-auth/node"

import type { Auth } from "../auth"
import { appendSetCookies } from "../http"
import type { NodeRequestLike, NodeResponseLike } from "../http"
import { AUTH } from "../tokens"

/** 登录后会挂到请求上的会话信息；只暴露出服务层需要的字段。 */
export type AuthSession = {
  session: { id: string; userId: string; expiresAt: Date }
  user: { id: string; role: string; phoneNumber?: string | null }
}

export type AuthenticatedRequest = NodeRequestLike & { authSession?: AuthSession }

/**
 * 需要登录的接口用这个守卫；未登录返回 401（不是 403）。
 *
 * 会话在 Better Auth 里可能被滑动刷新，刷新后的 `Set-Cookie` 会写回本次响应，
 * 这样 TanStack Start 的 SSR 才能把新 cookie 转给浏览器（pitfalls §3「会话刷新双写」）。
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const result = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers), returnHeaders: true })
    if (!result.response) throw new UnauthorizedException("请先登录")
    request.authSession = result.response as AuthSession
    appendSetCookies(context.switchToHttp().getResponse<NodeResponseLike>(), result.headers.getSetCookie())
    return true
  }
}

/** 在已通过 `SessionGuard` 的接口里取当前会话。 */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthSession =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().authSession as AuthSession,
)
