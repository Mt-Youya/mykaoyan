import { Injectable, Inject } from "@nestjs/common"
import type { Environment } from "../environment"

/** 启动配置的注入标记；由 `ConfigModule.forRoot` 提供。 */
export const CONFIG = Symbol("app-config")

/** 已校验的启动配置；其他模块通过 `@Inject(CONFIG)` 取用。 */
@Injectable()
export class ConfigService {
  constructor(@Inject(CONFIG) readonly environment: Environment) {}
}
