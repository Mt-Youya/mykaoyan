import { Inject, Injectable } from "@nestjs/common"
import type { OnModuleDestroy } from "@nestjs/common"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { CONFIG } from "../config"
import type { Environment } from "../environment"

export type Database = ReturnType<typeof createDatabase>["db"]

/**
 * 创建到 Postgres 的连接与 Drizzle 实例。
 *
 * 事务连接池 + 完整 TLS 校验 + 关闭预处理语句，与 Supavisor transaction 模式兼容；
 * 测试库是本机临时库，不使用 TLS。
 */
export function createDatabase(config: Environment & { DATABASE_URL: string }) {
  const sql = postgres(config.DATABASE_URL, {
    prepare: false,
    ssl:
      config.NODE_ENV === "test"
        ? false
        : config.DATABASE_CA
          ? { rejectUnauthorized: true, ca: config.DATABASE_CA }
          : "verify-full",
    max: 5,
    connect_timeout: 5,
    connection: { statement_timeout: 5000 },
  })
  return { sql, db: drizzle(sql), close: () => sql.end({ timeout: 1 }) }
}

/** 进程内唯一的数据库连接；由 `DatabaseModule` 提供并在关闭时释放。 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly connection: ReturnType<typeof createDatabase>

  constructor(@Inject(CONFIG) config: Environment) {
    const url = config.DATABASE_URL
    // 未配置数据库时 `DatabaseModule` 不会装配；这里再兜一层，避免误用。
    if (!url) throw new Error("数据库未配置")
    this.connection = createDatabase({ ...config, DATABASE_URL: url })
  }

  /** 原生 postgres 客户端（健康检查等需要精确控制事务的地方）。 */
  get client() {
    return this.connection.sql
  }

  /** Drizzle 实例。 */
  get db(): Database {
    return this.connection.db
  }

  async onModuleDestroy() {
    await this.connection.close()
  }
}
