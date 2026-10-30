import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

/**
 * 账号、登录方式、会话与出境同意记录的表结构（工单 05）。
 *
 * 每张表都开启 RLS 且不建策略：浏览器端拿不到数据库凭据，只有 `apps/api` 的高权限连接可用；
 * 迁移里还要对每张表写 `REVOKE ALL ON TABLE ... FROM PUBLIC, anon, authenticated`
 * （drizzle-kit 不生成 REVOKE，需要手写）。
 *
 * ## 与 Better Auth 的映射（改动前务必看懂）
 *
 * Better Auth 的模型名是 `user` / `session` / `account` / `verification`，本站 SQL 表名按项目
 * 术语换成 `accounts` / `sessions` / `login_methods` / `verification_tokens`，由
 * `apps/api/src/auth/auth.ts` 的 `drizzleAdapter(db, { schema: { user: accounts, session:
 * sessions, account: loginMethods, verification: verificationTokens } })` 显式映射。
 *
 * **drizzle adapter 按 Drizzle 表对象的属性名匹配 Better Auth 字段名，不认 SQL 列名。**
 * 所以这里的属性名必须与 Better Auth 模型字段一致（phoneNumber / phoneNumberVerified /
 * userId / accountId / providerId…），数据库里的中文术语列名用 `text("phone")` 这类第二个参数
 * 单独指定：
 * - `accounts.phoneNumber` → SQL 列 `phone`（手机号原文只在这里落库）
 * - `accounts.phoneNumberVerified` → SQL 列 `phone_verified`
 * - `sessions.userId` → SQL 列 `account_id`
 * - `loginMethods.userId` → SQL 列 `account_id`；`loginMethods.accountId` 是第三方的用户标识，
 *   SQL 列 `provider_account_id`（注意这个属性的名字来自 Better Auth，不是本站「账号」）
 *
 * 漏掉映射或改了属性名，运行期会找不到表/列，登录链路静默失败。
 */

/**
 * 账号：一个人在本站的唯一身份，以一个已验证的手机号为准（GLOSSARY「人与身份」）。
 *
 * - 会员状态不在这里存，由会员期推算（docs/PLAN.md §5.1）。
 * - `email` 是 Better Auth 要求的必填唯一字段。本站不收集邮箱：手机号首次登录时写入合成的
 *   占位地址（`phone-<手机号 HMAC>@phone.invalid`），不对外展示、不用于任何发信，
 *   也不把手机号本身拼进去。
 * - `role` 是管理员角色字段，默认 `account`，只允许服务端改动（Better Auth
 *   `additionalFields.role.input: false`）。
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text(),
    /** E.164，例如 +8613800138000（虚构测试号）。未绑定手机号的登录方式允许为空。 */
    phoneNumber: text("phone").unique(),
    phoneNumberVerified: boolean("phone_verified"),
    role: text().notNull().default("account"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("accounts_role_idx").on(table.role)],
).enableRLS()

/** 会话：一个账号在一台设备上的一次登录。不同设备各自一条，「退出当前设备」只删自己这条。 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid().defaultRandom().primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_account_idx").on(table.userId)],
).enableRLS()

/**
 * 登录方式：进入账号的一种途径。
 *
 * 手机号验证码登录不写这张表（凭据就是手机号本身）；以后加 QQ、微信等第三方登录时，
 * 每个第三方账号一条，`providerId` 记来源、`providerAccountId` 记对方的用户标识。
 */
export const loginMethods = pgTable(
  "login_methods",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("provider_account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("login_methods_account_idx").on(table.userId),
    uniqueIndex("login_methods_provider_account_unique").on(table.providerId, table.accountId),
  ],
).enableRLS()

/**
 * 验证码校验记录。
 *
 * 手机号验证码由阿里云号码认证签发与校验，Better Auth 侧配置
 * `verification.storeInDatabase: false`，所以这张表正常情况下没有行；保留它是为了以后
 * 改用本站自管令牌（如邮箱验证）时不用再改迁移。手机号不会写进这张表。
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid().defaultRandom().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verification_tokens_identifier_idx").on(table.identifier)],
).enableRLS()

/**
 * 发送验证码的频率记录。
 *
 * 手机号以 HMAC-SHA256 哈希保存（不是原文）：脱敏要求「手机号只存于账号表」，这里只需要能
 * 按同一个号码计数。`kind` 目前只有 `send_otp`。
 */
export const phoneLoginAttempts = pgTable(
  "phone_login_attempts",
  {
    id: uuid().defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull(),
    kind: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("phone_login_attempts_phone_kind_time_idx").on(table.phoneHash, table.kind, table.createdAt)],
).enableRLS()

/**
 * 个人信息出境同意记录。
 *
 * 《个人信息保护法》第三十九条要求单独同意、第五十五条要求做影响评估；PLAN §2 与 ADR 0005
 * 出境同意版本绑定实际数据库地区；另外记录同一时刻单独勾选的协议/隐私政策版本。
 * termsVersion 为空的历史行只证明旧版出境同意，不能作为新版协议已接受的证据。
 * 同一账号同一政策版本只有一条（重复提交不重复记录）。
 */
export const personalInfoTransferConsents = pgTable(
  "personal_info_transfer_consents",
  {
    id: uuid().defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    policyVersion: text("policy_version").notNull(),
    termsVersion: text("terms_version"),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("personal_info_transfer_consents_account_policy_unique").on(table.accountId, table.policyVersion),
    index("personal_info_transfer_consents_account_idx").on(table.accountId),
  ],
).enableRLS()
