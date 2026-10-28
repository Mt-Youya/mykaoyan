import { Inject, Injectable } from "@nestjs/common"
import type { Provider, Type } from "@nestjs/common"
import { CONFIG } from "../config"
import { DatabaseService } from "../database"
import type { Environment } from "../environment"
import { AuthController } from "./auth.controller"
import { createAuth, createDrizzleAuthDatabase } from "./auth"
import type { Auth, BetterAuthDatabase } from "./auth"
import { readAuthEnvironment } from "./environment"
import type { AuthEnvironment } from "./environment"
import { PhoneController } from "./phone"
import { PhoneAuthService } from "./phone"
import { SessionGuard } from "./session"
import { MemorySmsVerifier, AliyunSmsVerifier } from "./sms"
import type { SmsVerifier } from "./sms"
import { createDrizzleStores } from "./stores"
import type { AuthStores } from "./stores"
import { AUTH, AUTH_ENV, AUTH_STORES, CLOCK, SMS_VERIFIER } from "./tokens"

/**
 * 认证持久化：始终用 Drizzle + 真实 Postgres。
 *
 * `NODE_ENV=test` 只强制内存短信（禁止真实发送），不改变数据库：集成测试要验证真实的
 * 唯一约束、会话表与同意记录。纯单元测试若要脱离数据库，自己在测试里装配内存 adapter。
 */
@Injectable()
export class AuthPersistence {
  readonly stores: AuthStores
  readonly database: BetterAuthDatabase

  constructor(@Inject(DatabaseService) database: DatabaseService) {
    this.stores = createDrizzleStores(database.db)
    this.database = createDrizzleAuthDatabase(database.db)
  }
}

export const authControllers: Type<unknown>[] = [AuthController, PhoneController]

export const authProviders: Provider[] = [
  {
    provide: AUTH_ENV,
    inject: [CONFIG],
    useFactory: (config: Environment): AuthEnvironment => readAuthEnvironment(process.env, config.NODE_ENV),
  },
  AuthPersistence,
  {
    provide: SMS_VERIFIER,
    inject: [AUTH_ENV],
    useFactory: (env: AuthEnvironment): SmsVerifier =>
      env.sms.provider === "memory" ? new MemorySmsVerifier() : new AliyunSmsVerifier(env.sms),
  },
  { provide: CLOCK, useValue: () => new Date() },
  {
    provide: AUTH_STORES,
    inject: [AuthPersistence],
    useFactory: (persistence: AuthPersistence): AuthStores => persistence.stores,
  },
  {
    provide: AUTH,
    inject: [AUTH_ENV, SMS_VERIFIER, AuthPersistence],
    useFactory: (env: AuthEnvironment, sms: SmsVerifier, persistence: AuthPersistence): Auth =>
      createAuth({ env, sms, database: persistence.database }),
  },
  PhoneAuthService,
  SessionGuard,
]
