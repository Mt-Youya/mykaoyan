import { Body, Controller, Get, Header, Inject, Post, Req, Res } from "@nestjs/common"
import { toFetchHeaders, writeJson, writeProblem } from "../http"
import type { NodeRequestLike, NodeResponseLike } from "../http"
import { PhoneAuthService } from "./phone.service"

/**
 * 手机号验证码登录的公开接口。
 *
 * 这些接口是唯一允许发送/校验验证码的入口（Better Auth 自带的 `/api/auth/phone-number/*`
 * 被 AuthController 404）。错误统一用 `application/problem+json`，并保留上游错误码；
 * 退出接口的 `Set-Cookie` 直接写回，保证浏览器真的丢掉会话 cookie。
 */
@Controller("phone")
export class PhoneController {
  constructor(@Inject(PhoneAuthService) private readonly phone: PhoneAuthService) {}

  /** 前端读取位数、有效期与政策版本，避免在页面里写死。 */
  @Get("policy")
  @Header("Cache-Control", "no-store")
  policy() {
    return this.phone.policy()
  }

  @Post("request-code")
  async requestCode(@Body() body: unknown, @Res() response: NodeResponseLike): Promise<void> {
    const result = await this.phone.requestCode(body)
    if (!result.ok) {
      writeProblem(
        response,
        result.problem.status,
        result.problem.title,
        result.problem.code,
        result.problem.retryAfterSeconds
      )
      return
    }
    writeJson(response, 200, { cooldownSeconds: result.cooldownSeconds })
  }

  @Post("verify")
  async verify(
    @Body() body: unknown,
    @Req() request: NodeRequestLike,
    @Res() response: NodeResponseLike
  ): Promise<void> {
    const result = await this.phone.verify(body, toFetchHeaders(request.headers))
    if (!result.ok) {
      writeProblem(response, result.problem.status, result.problem.title, result.problem.code)
      return
    }
    if (result.setCookies.length > 0) response.setHeader("set-cookie", result.setCookies)
    writeJson(response, 200, { accountId: result.accountId })
  }

  /** 退出当前设备：只结束本次会话。 */
  @Post("sign-out")
  async signOut(@Req() request: NodeRequestLike, @Res() response: NodeResponseLike): Promise<void> {
    const result = await this.phone.signOutCurrent(toFetchHeaders(request.headers))
    if (!result.ok) {
      writeProblem(response, result.problem.status, result.problem.title, result.problem.code)
      return
    }
    if (result.setCookies.length > 0) response.setHeader("set-cookie", result.setCookies)
    writeJson(response, 200, { signedOut: "current" })
  }

  /** 退出所有设备：撤销全部会话。 */
  @Post("sign-out-all")
  async signOutAll(@Req() request: NodeRequestLike, @Res() response: NodeResponseLike): Promise<void> {
    const result = await this.phone.signOutAll(toFetchHeaders(request.headers))
    if (!result.ok) {
      writeProblem(response, result.problem.status, result.problem.title, result.problem.code)
      return
    }
    if (result.setCookies.length > 0) response.setHeader("set-cookie", result.setCookies)
    writeJson(response, 200, { signedOut: "all" })
  }
}
