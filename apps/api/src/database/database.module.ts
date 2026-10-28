import { Global, Module } from "@nestjs/common"
import { DatabaseService } from "./database.service"

/** 全局数据库模块：各领域服务注入 `DatabaseService`，不再各自建连接池。 */
@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
