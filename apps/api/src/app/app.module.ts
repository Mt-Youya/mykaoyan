import { Module } from "@nestjs/common"
import type { DynamicModule } from "@nestjs/common"

import { AdminModule } from "../admin"
import { AdmissionsModule } from "../admissions"
import { AgentTokensModule } from "../agent-tokens"
import { AuthModule } from "../auth"
import { CatalogEmptyModule, CatalogModule } from "../catalog"
import { CommentsModule } from "../comments"
import { ConfigModule } from "../config"
import { DatabaseModule } from "../database"
import type { Environment } from "../environment"
import { MembershipModule } from "../membership"
import { PapersModule } from "../papers"
import { PlaybackModule } from "../playback"
import { ProgressModule } from "../progress"
import { PublishingModule } from "../publishing"
import { SubmissionsEmptyModule, SubmissionsModule } from "../submissions"
import { AppController } from "./app.controller"
import { AppService } from "./app.service"

/**
 * 应用根模块：按领域装配子模块，启动配置经 `forRoot` 注入。
 *
 * 未配置 `DATABASE_URL` 时只装配不依赖数据库的领域：招生目录查询（调研招网上游）
 * 与空的课程/讲义列表；本地无需跑 Postgres。生产环境必须配置数据库。
 */
@Module({})
export class AppModule {
  static forRoot(environment: Environment): DynamicModule {
    const database = environment.DATABASE_URL !== undefined
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(environment),
        ...(database
          ? [
              DatabaseModule,
              AuthModule,
              CatalogModule,
              PapersModule,
              PlaybackModule,
              AdminModule,
              AgentTokensModule,
              ProgressModule,
              MembershipModule,
              CommentsModule,
              SubmissionsModule,
              PublishingModule,
            ]
          : [CatalogEmptyModule, SubmissionsEmptyModule]),
        AdmissionsModule,
      ],
      controllers: database ? [AppController] : [],
      providers: database ? [AppService] : [],
    }
  }
}
