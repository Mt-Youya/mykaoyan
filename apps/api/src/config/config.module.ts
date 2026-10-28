import { Module } from "@nestjs/common"
import type { DynamicModule } from "@nestjs/common"
import type { Environment } from "../environment"
import { CONFIG, ConfigService } from "./config.service"

/** 把已校验的启动配置注册为全局依赖。 */
@Module({})
export class ConfigModule {
  static forRoot(environment: Environment): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [
        { provide: CONFIG, useValue: environment },
        { provide: ConfigService, useFactory: (env: Environment) => new ConfigService(env), inject: [CONFIG] },
      ],
      exports: [CONFIG, ConfigService],
    }
  }
}
