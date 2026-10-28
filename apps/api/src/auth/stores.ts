import { and, count, desc, eq, gte } from "drizzle-orm"
import { accounts, personalInfoTransferConsents, phoneLoginAttempts } from "@mykaoyan/db"
import type { Database } from "../database"

/**
 * 认证用到的三块持久化：发送频率记录、出境同意记录、按手机号查账号。
 *
 * 手机号在频率记录里只以 HMAC 哈希出现（「手机号只存于账号表」）。测试与 `NODE_ENV=test`
 * 使用内存实现，真实 Postgres 路径见各 Drizzle 实现。
 */
export interface PhoneAttemptStore {
  record(phoneHash: string, kind: string, at: Date): Promise<void>
  countSince(phoneHash: string, kind: string, since: Date): Promise<number>
  latest(phoneHash: string, kind: string): Promise<Date | undefined>
  /** 窗口内最早一条记录，用来算「还要等多久」。 */
  oldestSince(phoneHash: string, kind: string, since: Date): Promise<Date | undefined>
}

export interface ConsentStore {
  record(accountId: string, policyVersion: string, at: Date): Promise<void>
}

export interface AccountPhoneLookup {
  findIdByPhone(e164Phone: string): Promise<string | undefined>
}

export type AuthStores = {
  attempts: PhoneAttemptStore
  consents: ConsentStore
  accountPhones: AccountPhoneLookup
}

/** 发送验证码的记录类型；以后加「校验失败」等类型时往这里加常量。 */
export const SEND_OTP_KIND = "send_otp"

export function createDrizzleStores(db: Database): AuthStores {
  return {
    attempts: {
      async record(phoneHash, kind, at) {
        await db.insert(phoneLoginAttempts).values({ phoneHash, kind, createdAt: at })
      },
      async countSince(phoneHash, kind, since) {
        const [row] = await db
          .select({ value: count() })
          .from(phoneLoginAttempts)
          .where(
            and(
              eq(phoneLoginAttempts.phoneHash, phoneHash),
              eq(phoneLoginAttempts.kind, kind),
              gte(phoneLoginAttempts.createdAt, since)
            )
          )
        return row?.value ?? 0
      },
      async latest(phoneHash, kind) {
        const [row] = await db
          .select({ createdAt: phoneLoginAttempts.createdAt })
          .from(phoneLoginAttempts)
          .where(and(eq(phoneLoginAttempts.phoneHash, phoneHash), eq(phoneLoginAttempts.kind, kind)))
          .orderBy(desc(phoneLoginAttempts.createdAt))
          .limit(1)
        return row?.createdAt
      },
      async oldestSince(phoneHash, kind, since) {
        const [row] = await db
          .select({ createdAt: phoneLoginAttempts.createdAt })
          .from(phoneLoginAttempts)
          .where(
            and(
              eq(phoneLoginAttempts.phoneHash, phoneHash),
              eq(phoneLoginAttempts.kind, kind),
              gte(phoneLoginAttempts.createdAt, since)
            )
          )
          .orderBy(phoneLoginAttempts.createdAt)
          .limit(1)
        return row?.createdAt
      },
    },
    consents: {
      async record(accountId, policyVersion, at) {
        // 同一账号同一政策版本只留一条；重复提交不报错也不重复记录。
        await db
          .insert(personalInfoTransferConsents)
          .values({ accountId, policyVersion, consentedAt: at })
          .onConflictDoNothing()
      },
    },
    accountPhones: {
      async findIdByPhone(e164Phone) {
        const [row] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.phoneNumber, e164Phone))
          .limit(1)
        return row?.id
      },
    },
  }
}

/** 内存实现：测试与 NODE_ENV=test 用，不连数据库。 */
export type MemoryAuthStores = AuthStores & {
  /** 测试专用：预置一个已注册账号，模拟「不是首次登录」。 */
  seedAccount(phone: string, id: string): void
  /** 测试专用：读出已记录的出境同意。 */
  listConsents(): { accountId: string; policyVersion: string; at: Date }[]
}

export function createMemoryStores(): MemoryAuthStores {
  const attempts: { phoneHash: string; kind: string; at: Date }[] = []
  const consents: { accountId: string; policyVersion: string; at: Date }[] = []
  const phones = new Map<string, string>()
  return {
    attempts: {
      async record(phoneHash, kind, at) {
        attempts.push({ phoneHash, kind, at: new Date(at) })
      },
      async countSince(phoneHash, kind, since) {
        return attempts.filter(
          (item) => item.phoneHash === phoneHash && item.kind === kind && item.at.getTime() >= since.getTime()
        ).length
      },
      async latest(phoneHash, kind) {
        const matched = attempts
          .filter((item) => item.phoneHash === phoneHash && item.kind === kind)
          .map((item) => item.at)
        if (matched.length === 0) return undefined
        return new Date(Math.max(...matched.map((at) => at.getTime())))
      },
      async oldestSince(phoneHash, kind, since) {
        const matched = attempts
          .filter((item) => item.phoneHash === phoneHash && item.kind === kind && item.at.getTime() >= since.getTime())
          .map((item) => item.at)
        if (matched.length === 0) return undefined
        return new Date(Math.min(...matched.map((at) => at.getTime())))
      },
    },
    consents: {
      async record(accountId, policyVersion, at) {
        if (consents.some((item) => item.accountId === accountId && item.policyVersion === policyVersion)) return
        consents.push({ accountId, policyVersion, at: new Date(at) })
      },
    },
    accountPhones: {
      async findIdByPhone(e164Phone) {
        return phones.get(e164Phone)
      },
    },
    seedAccount(phone, id) {
      phones.set(phone, id)
    },
    listConsents() {
      return consents.map((item) => Object.assign({}, item))
    },
  }
}
