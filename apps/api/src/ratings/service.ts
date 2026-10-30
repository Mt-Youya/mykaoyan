import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { z } from "zod"

import { publicTopics, RATING_PRIOR_COUNT, ratingInputSchema, ratingSummary } from "@mykaoyan/core"

import { CONFIG } from "../config"
import { DatabaseService } from "../database"
import type { Environment } from "../environment"
import { MembershipService } from "../membership"
type RankedSubmission = {
  id: string
  account_id: string | null
  title: string
  summary: string
  subject_code: string
  topic_id: string | null
  duration: number
  status: "approved"
  listed: boolean
  created_at: string | Date
  ratingCount: number
  ratingSum: number
  globalMean: number
}
@Injectable()
export class RatingsService {
  constructor(
    @Inject(DatabaseService) private database: DatabaseService,
    @Inject(CONFIG) private config: Environment,
    @Inject(MembershipService) private membership: MembershipService,
  ) {}
  private open(id: string) {
    if (!this.config.COMMUNITY_ENABLED) throw new ForbiddenException("评分尚未开放")
    if (!z.uuid().safeParse(id).success) throw new NotFoundException("投稿不存在")
  }
  async ranked(subject: string, page: number, topic = "") {
    if (!/^[0-9]{3}$/.test(subject) || !Number.isInteger(page) || page < 0 || page > 1_000_000)
      throw new BadRequestException("考试科目或页码无效")
    if (topic && !publicTopics.some((t) => t.id === topic && t.subject === subject))
      throw new BadRequestException("考点不属于所选考试科目")
    if (!this.config.COMMUNITY_ENABLED) return { enabled: false, items: [], hasMore: false }
    const sql = this.database.client
    const rows = await sql<RankedSubmission[]>`
      with eligible as (select * from submissions where status='approved' and listed and delete_marked_at is null and deleted_at is null),
      totals as (select s.id,count(r.account_id)::integer as n,coalesce(sum(r.stars),0)::float8 as total from eligible s left join submission_ratings r on r.submission_id=s.id group by s.id),
      baseline as (select coalesce(sum(total)/nullif(sum(n),0),0)::float8 as mean from totals)
      select s.*,t.n as "ratingCount",t.total as "ratingSum",b.mean as "globalMean",(${RATING_PRIOR_COUNT}*b.mean+t.total)/(${RATING_PRIOR_COUNT}+t.n) as "sortScore"
      from eligible s join totals t on t.id=s.id cross join baseline b
      where s.subject_code=${subject} ${topic ? sql`and s.topic_id=${topic}` : sql``}
      order by "sortScore" desc,t.n desc,s.created_at desc,s.id desc limit 51 offset ${page * 50}`
    return {
      enabled: true,
      items: rows.slice(0, 50).map((submission) => ({
        submission,
        stats: ratingSummary(submission.ratingCount, submission.ratingSum, submission.globalMean),
      })),
      hasMore: rows.length > 50,
    }
  }
  async mine(accountId: string, id: string) {
    this.open(id)
    const [row] = await this.database.client<
      { account_id: string | null; stars: number | null }[]
    >`select s.account_id,r.stars from submissions s left join submission_ratings r on r.submission_id=s.id and r.account_id=${accountId} where s.id=${id} and s.status='approved' and s.listed and s.delete_marked_at is null and s.deleted_at is null`
    if (!row) throw new NotFoundException("投稿不存在或未上架")
    return { stars: row.stars, isOwn: row.account_id === accountId }
  }
  async put(accountId: string, id: string, input: unknown) {
    this.open(id)
    if (!(await this.membership.status(accountId)).active)
      throw new ForbiddenException("评分需要有效会员，请先手动开通或兑换会员期")
    const parsed = ratingInputSchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException("评分必须是1到5的整数星数")
    return this.database.client.begin(async (sql) => {
      const [submission] = await sql<
        { account_id: string | null }[]
      >`select account_id from submissions where id=${id} and status='approved' and listed and delete_marked_at is null and deleted_at is null for update`
      if (!submission) throw new NotFoundException("投稿不存在或未上架")
      if (submission.account_id === accountId) throw new ForbiddenException("不能给自己的投稿评分")
      const [saved] = await sql<
        { stars: number }[]
      >`insert into submission_ratings(submission_id,account_id,stars) values(${id},${accountId},${parsed.data.stars}) on conflict(submission_id,account_id) do update set stars=excluded.stars,updated_at=now() returning stars`
      if (!saved) throw new Error("评分写入未返回记录")
      return { stars: saved.stars, isOwn: false }
    })
  }
}
