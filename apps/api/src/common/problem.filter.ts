import { Catch, HttpException } from "@nestjs/common"
import type { ArgumentsHost, ExceptionFilter, HttpServer } from "@nestjs/common"

/**
 * 全局异常过滤器：所有错误统一输出 `application/problem+json`。
 *
 * 未知错误只暴露通用文案，不把内部信息（连接串、堆栈）带进响应。
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(private readonly adapter: HttpServer) {}

  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException ? error.getStatus() : 500
    const title = error instanceof HttpException ? error.message : "服务暂不可用"
    const response = host.switchToHttp().getResponse()
    this.adapter.setHeader(response, "Content-Type", "application/problem+json")
    this.adapter.setHeader(response, "Cache-Control", "no-store")
    this.adapter.reply(response, { type: "about:blank", title, status }, status)
  }
}
