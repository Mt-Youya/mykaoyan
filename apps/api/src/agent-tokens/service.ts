import { createHash, randomBytes } from "node:crypto"

import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"

import { DatabaseService } from "../database"

export type AgentTokenSummary = {
  id: string
  scope: string
  name: string
  last4: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

type Timestamp = Date | string

type TokenRow = {
  id: string
  scope: string
  name: string
  last4: string
  createdAt: Timestamp
  lastUsedAt: Timestamp | null
  revokedAt: Timestamp | null
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function iso(value: Timestamp | null) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function toSummary(row: TokenRow): AgentTokenSummary {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    last4: row.last4,
    createdAt: iso(row.createdAt) ?? "",
    lastUsedAt: iso(row.lastUsedAt),
    revokedAt: iso(row.revokedAt),
  }
}

/**
 * Agent 令牌的创建、列表、吊销与 Bearer 校验。
 *
 * 明文只在 `create` 返回一次；库里只有 SHA-256 与末 4 位。令牌只绑定账号，
 * 不产生网页会话，因此不能用于登录或管理员接口。
 */
@Injectable()
export class AgentTokensService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async create(accountId: string, name: string, scope: "progress" | "publish" = "progress") {
    if (scope === "publish") {
      const [account] = await this.database.client<{ role: string }[]>`select role from accounts where id=${accountId}`
      if (account?.role !== "admin") throw new ForbiddenException("只有管理员能创建发布令牌")
    }
    const token = randomBytes(32).toString("base64url")
    const rows = await this.database.client<TokenRow[]>`
      insert into agent_tokens (account_id, name, token_hash, last4, scope)
      values (${accountId}, ${name}, ${hashToken(token)}, ${token.slice(-4)}, ${scope})
      returning id, scope, name, last4, created_at as "createdAt", last_used_at as "lastUsedAt", revoked_at as "revokedAt"`
    const row = rows[0]
    if (!row) throw new Error("创建令牌未返回记录")
    return { ...toSummary(row), token }
  }

  async list(accountId: string): Promise<AgentTokenSummary[]> {
    const rows = await this.database.client<TokenRow[]>`
      select id, scope, name, last4, created_at as "createdAt", last_used_at as "lastUsedAt", revoked_at as "revokedAt"
      from agent_tokens
      where account_id = ${accountId}
      order by created_at desc`
    return rows.map(toSummary)
  }

  async revoke(accountId: string, id: string): Promise<void> {
    const rows = await this.database.client<{ id: string }[]>`
      update agent_tokens
      set revoked_at = now()
      where id = ${id} and account_id = ${accountId} and revoked_at is null
      returning id`
    if (!rows[0]) throw new NotFoundException("令牌不存在或已吊销")
  }

  /** 校验 Bearer 明文；成功时更新最后使用时间并返回账号 id。 */
  async verify(token: string): Promise<string | null> {
    const rows = await this.database.client<{ accountId: string }[]>`
      update agent_tokens
      set last_used_at = now()
      where token_hash = ${hashToken(token)} and revoked_at is null and scope = 'progress'
      returning account_id as "accountId"`
    return rows[0]?.accountId ?? null
  }
  async verifyPublisher(token: string): Promise<string | null> {
    const [identity] = await this.database.client<
      { accountId: string; scope: string; role: string }[]
    >`select t.account_id as "accountId",t.scope,a.role from agent_tokens t join accounts a on a.id=t.account_id where t.token_hash=${hashToken(token)} and t.revoked_at is null`
    if (!identity) return null
    if (identity.scope !== "publish" || identity.role !== "admin")
      throw new ForbiddenException("令牌没有管理员发布权限")
    const rows = await this.database.client<{ accountId: string }[]>`
      update agent_tokens t set last_used_at=now() from accounts a
      where t.account_id=a.id and a.role='admin' and t.scope='publish'
        and t.token_hash=${hashToken(token)} and t.revoked_at is null
      returning t.account_id as "accountId"`
    return rows[0]?.accountId ?? null
  }
}
