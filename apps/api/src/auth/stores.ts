import { and, count, desc, eq, gte } from "drizzle-orm"

import { personalInfoTransferConsents, phoneLoginAttempts } from "@mykaoyan/db"

import type { Database } from "../database"

/**
 * 认证用到的持久化：发送频率记录与政策同意记录。
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
  record(accountId: string, policyVersion: string, at: Date, termsVersion?: string): Promise<void>
}

export type AuthStores = {
  attempts: PhoneAttemptStore
  consents: ConsentStore
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
              gte(phoneLoginAttempts.createdAt, since),
            ),
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
              gte(phoneLoginAttempts.createdAt, since),
            ),
          )
          .orderBy(phoneLoginAttempts.createdAt)
          .limit(1)
        return row?.createdAt
      },
    },
    consents: {
      async record(accountId, policyVersion, at, termsVersion) {
        // 同一账号同一政策版本只留一条；重复提交不报错也不重复记录。
        await db
          .insert(personalInfoTransferConsents)
          .values({ accountId, policyVersion, consentedAt: at, termsVersion })
          .onConflictDoNothing()
        const [saved] = await db
          .select()
          .from(personalInfoTransferConsents)
          .where(
            and(
              eq(personalInfoTransferConsents.accountId, accountId),
              eq(personalInfoTransferConsents.policyVersion, policyVersion),
            ),
          )
          .limit(1)
        if (!saved || (termsVersion !== undefined && saved.termsVersion !== termsVersion))
          throw new Error("同意记录未保存")
      },
    },
  }
}

/** 内存实现：测试与 NODE_ENV=test 用，不连数据库。 */
export type MemoryAuthStores = AuthStores & {
  /** 测试专用：读出已记录的出境同意。 */
  listConsents(): { accountId: string; policyVersion: string; termsVersion?: string; at: Date }[]
}

export function createMemoryStores(): MemoryAuthStores {
  const attempts: { phoneHash: string; kind: string; at: Date }[] = []
  const consents: { accountId: string; policyVersion: string; termsVersion?: string; at: Date }[] = []
  return {
    attempts: {
      async record(phoneHash, kind, at) {
        attempts.push({ phoneHash, kind, at: new Date(at) })
      },
      async countSince(phoneHash, kind, since) {
        return attempts.filter(
          (item) => item.phoneHash === phoneHash && item.kind === kind && item.at.getTime() >= since.getTime(),
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
      async record(accountId, policyVersion, at, termsVersion) {
        if (consents.some((item) => item.accountId === accountId && item.policyVersion === policyVersion)) return
        consents.push({ accountId, policyVersion, ...(termsVersion ? { termsVersion } : {}), at: new Date(at) })
      },
    },
    listConsents() {
      return consents.map((item) => ({ ...item }))
    },
  }
}
