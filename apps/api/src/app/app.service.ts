import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common"

import { DatabaseService } from "../database"

/** 健康检查：真的执行一次数据库查询，而不是只看进程活着。 */
@Injectable()
export class AppService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async check() {
    try {
      // 事务保留连接，避免 Supavisor transaction 模式下的查询流水线串扰。
      const rows = await this.database.client.begin((sql) => sql`select 1 as connected`)
      if (rows[0]?.connected !== 1) throw new Error("数据库健康检查未返回预期结果")
      return { status: "ok", database: "connected" }
    } catch {
      throw new ServiceUnavailableException("数据库暂不可用")
    }
  }
}
