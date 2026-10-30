import { createHash, randomBytes } from "node:crypto"

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { z } from "zod"

import { membershipStatus, nextMembershipPeriod } from "@mykaoyan/core"
import type { MembershipPeriod } from "@mykaoyan/core"

import { DatabaseService } from "../database"
const grantSchema = z.strictObject({ accountId: z.uuid(), reason: z.string().trim().min(1).max(500) })
const hash = (code: string) => createHash("sha256").update(code).digest("hex")
type PeriodRow = { startsAt: Date | string; endsAt: Date | string }
const periods = (rows: PeriodRow[]): MembershipPeriod[] =>
  rows.map((p) => ({ startsAt: new Date(p.startsAt).toISOString(), endsAt: new Date(p.endsAt).toISOString() }))
@Injectable()
export class MembershipService {
  constructor(@Inject(DatabaseService) private database: DatabaseService) {}
  private async admin(actor: { id: string; role: string }) {
    const [row] = await this.database.client<{ role: string }[]>`select role from accounts where id=${actor.id}`
    if (actor.role !== "admin" || row?.role !== "admin") throw new ForbiddenException("只有管理员能管理会员期与兑换码")
  }
  async status(accountId: string) {
    const rows = await this.database.client<
      PeriodRow[]
    >`select starts_at as "startsAt",ends_at as "endsAt" from membership_periods where account_id=${accountId} order by starts_at`
    return membershipStatus(periods(rows), Date.now())
  }
  async findAccount(actor: { id: string; role: string }, input: unknown) {
    await this.admin(actor)
    const parsed = z.strictObject({ phone: z.string().regex(/^1[3-9]\d{9}$/) }).safeParse(input)
    if (!parsed.success) throw new BadRequestException("请输入待开通账号的11位手机号")
    const [account] = await this.database.client<
      { id: string }[]
    >`select id from accounts where phone=${`+86${parsed.data.phone}`}`
    if (!account) throw new NotFoundException("未找到该手机号对应的账号")
    return { id: account.id }
  }
  async grant(actor: { id: string; role: string }, input: unknown) {
    await this.admin(actor)
    const parsed = grantSchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException("请提供账号编号与开通原因（1至500字）")
    const { accountId, reason } = parsed.data
    return this.database.client.begin(async (sql) => {
      const [account] = await sql`select id from accounts where id=${accountId} for update`
      if (!account) throw new NotFoundException("账号不存在")
      const rows = await sql<
        PeriodRow[]
      >`select starts_at as "startsAt",ends_at as "endsAt" from membership_periods where account_id=${accountId}`
      const period = nextMembershipPeriod(periods(rows), Date.now())
      const [saved] =
        await sql`insert into membership_periods(account_id,starts_at,ends_at,source,reason,actor_id) values(${accountId},${period.startsAt},${period.endsAt},'manual',${reason},${actor.id}) returning id`
      if (!saved) throw new Error("会员期开通未返回记录")
      return period
    })
  }
  async generate(actor: { id: string; role: string }, input: unknown) {
    await this.admin(actor)
    const parsed = z.strictObject({ count: z.number().int().min(1).max(100) }).safeParse(input)
    if (!parsed.success) throw new BadRequestException("每次生成1至100个兑换码")
    const codes = Array.from({ length: parsed.data.count }, () => randomBytes(16).toString("hex").toUpperCase())
    const generated = await this.database.client.begin(async (sql) => {
      const values = codes.map((code) => ({ code_hash: hash(code), last4: code.slice(-4), created_by: actor.id }))
      const rows = await sql<
        { id: string; code_hash: string }[]
      >`insert into redemption_codes ${sql(values)} returning id,code_hash`
      if (rows.length !== codes.length) throw new Error("兑换码生成数量不符")
      return rows
    })
    return { codes: codes.map((code) => ({ id: generated.find((row) => row.code_hash === hash(code))!.id, code })) }
  }
  async listCodes(actor: { id: string; role: string }, page: number) {
    await this.admin(actor)
    if (!Number.isInteger(page) || page < 0 || page > 1_000_000) throw new BadRequestException("页码无效")
    const rows = await this.database.client<
      {
        id: string
        last4: string
        createdAt: string | Date
        redeemedAt: string | Date | null
        redeemedBy: string | null
      }[]
    >`select id,last4,created_at as "createdAt",redeemed_at as "redeemedAt",redeemed_by as "redeemedBy" from redemption_codes order by created_at desc,id desc limit 51 offset ${page * 50}`
    return {
      items: rows.slice(0, 50).map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt).toISOString(),
        redeemedAt: row.redeemedAt ? new Date(row.redeemedAt).toISOString() : null,
      })),
      hasMore: rows.length > 50,
    }
  }
  async redeem(accountId: string, input: unknown) {
    const parsed = z
      .strictObject({
        code: z
          .string()
          .trim()
          .regex(/^[a-fA-F0-9]{32}$/),
      })
      .safeParse(input)
    if (!parsed.success) throw new BadRequestException("兑换码格式无效")
    return this.database.client.begin(async (sql) => {
      const [account] = await sql`select id from accounts where id=${accountId} for update`
      if (!account) throw new NotFoundException("账号不存在")
      const [code] = await sql<
        { id: string; redeemed_at: Date | null }[]
      >`select id,redeemed_at from redemption_codes where code_hash=${hash(parsed.data.code.toUpperCase())} for update`
      if (!code || code.redeemed_at) throw new ConflictException("兑换码不存在或已兑换")
      const rows = await sql<
        PeriodRow[]
      >`select starts_at as "startsAt",ends_at as "endsAt" from membership_periods where account_id=${accountId}`
      const now = Date.now(),
        period = nextMembershipPeriod(periods(rows), now)
      const [saved] =
        await sql`insert into membership_periods(account_id,starts_at,ends_at,source,code_id) values(${accountId},${period.startsAt},${period.endsAt},'code',${code.id}) returning id`
      const [used] =
        await sql`update redemption_codes set redeemed_by=${accountId},redeemed_at=${new Date(now).toISOString()} where id=${code.id} and redeemed_at is null returning id`
      if (!saved || !used) throw new Error("兑换未写入完整结果")
      return period
    })
  }
}
