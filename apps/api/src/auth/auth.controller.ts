import { All, Controller, Inject, Req, Res } from "@nestjs/common"

import type { Auth } from "./auth"
import { toFetchRequest, writeFetchResponse, writeProblem } from "./http"
import type { NodeRequestLike, NodeResponseLike } from "./http"
import { AUTH } from "./tokens"

/**
 * Better Auth 的挂载点：`/api/auth/*`（全局前缀 `api` + `basePath: "/api/auth"`）。
 *
 * 用 `auth.handler(Request)` 直接接管，而不是社区 `@thallesp/nestjs-better-auth`：
 * 后者是 beta 的社区库，要求全局关闭 body parser 并接管路由守卫；这里只需要一个通配控制器，
 * 其余服务照常由 Nest 处理。
 *
 * 插件自带的 `/phone-number/*` 端点在这里一律 404：验证码的发送与校验必须经过
 * `/api/phone/*`，那里才有频率限制、出境同意与脱敏日志。
 */
const BLOCKED_PREFIXES = ["phone-number"]

@Controller("auth")
export class AuthController {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  @All()
  async root(@Req() request: NodeRequestLike, @Res() response: NodeResponseLike): Promise<void> {
    await this.forward(request, response)
  }

  @All("*splat")
  async rest(@Req() request: NodeRequestLike, @Res() response: NodeResponseLike): Promise<void> {
    await this.forward(request, response)
  }

  private async forward(request: NodeRequestLike, response: NodeResponseLike): Promise<void> {
    const path = (request.originalUrl ?? request.url ?? "").split("?")[0] ?? ""
    const subPath = path.replace(/^\/api\/auth\/?/, "")
    if (BLOCKED_PREFIXES.some((prefix) => subPath === prefix || subPath.startsWith(`${prefix}/`))) {
      writeProblem(response, 404, "该接口不可用", "ENDPOINT_DISABLED")
      return
    }
    const result = await this.auth.handler(toFetchRequest(request, this.baseUrl()))
    await writeFetchResponse(result, response)
  }

  private baseUrl(): string {
    const configured = this.auth.options.baseURL
    return typeof configured === "string" ? configured : "http://127.0.0.1"
  }
}
