import "reflect-metadata"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"
import { ProblemFilter } from "../common"
import type { Environment } from "../environment"

/** 组装好的应用实例；`main.ts` 与集成测试共用同一条装配路径。 */
export async function createApp(environment: Environment) {
  const app = await NestFactory.create(AppModule.forRoot(environment), { logger: false, abortOnError: false })
  app.setGlobalPrefix("api")
  app.useGlobalFilters(new ProblemFilter(app.getHttpAdapter()))
  app.enableShutdownHooks()
  return app
}
