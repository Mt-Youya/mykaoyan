import "reflect-metadata"
import { NestFactory } from "@nestjs/core"
import type { NestExpressApplication } from "@nestjs/platform-express"

import { ProblemFilter } from "../common"
import type { Environment } from "../environment"
import { AppModule } from "./app.module"

/** 组装好的应用实例；`main.ts` 与集成测试共用同一条装配路径。 */
export async function createApp(environment: Environment) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(environment), {
    logger: false,
    abortOnError: false,
    bodyParser: false,
  })
  // 讲义发布请求体上限 1 MB（契约约束），默认 100 kB 会在校验前拒绝合法内容。
  app.useBodyParser("json", { limit: "2mb" })
  app.useBodyParser("urlencoded", { limit: "2mb", extended: true })
  app.setGlobalPrefix("api")
  app.useGlobalFilters(new ProblemFilter(app.getHttpAdapter()))
  app.enableShutdownHooks()
  return app
}
