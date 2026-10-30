import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import type { OnModuleInit, OnModuleDestroy } from "@nestjs/common"
import { z } from "zod"
import { SubmissionAccess, ownSubmissionView } from "./access"
import type { Actor, SubmissionRow } from "./access"
import { SUBMISSION_STORAGE } from "./storage"
import type { SubmissionStorage } from "./storage"
@Injectable()
export class SubmissionModeration implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>
  private running = false
  constructor(
    @Inject(SubmissionAccess) private access: SubmissionAccess,
    @Inject(SUBMISSION_STORAGE) private storage: SubmissionStorage
  ) {}
  onModuleInit() {
    if (this.access.config.NODE_ENV !== "production") return
    const run = () => {
      void this.cleanup().catch(() => console.warn("投稿文件清理失败，将在下次重试"))
    }
    run()
    this.timer = setInterval(run, 60 * 60 * 1000)
    this.timer.unref()
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }
  async review(actor: Actor, id: string, input: unknown) {
    await this.access.admin(actor)
    this.access.id(id)
    const parsed = z
      .discriminatedUnion("decision", [
        z.strictObject({ decision: z.literal("approve") }),
        z.strictObject({ decision: z.literal("reject"), reason: z.string().trim().min(1).max(500) }),
      ])
      .safeParse(input)
    if (!parsed.success) throw new BadRequestException("审核须选择通过或驳回，驳回必须填写1至500字原因")
    // 关闭时允许审核但不能上架；开放后管理员可单独上架已通过的投稿。
    const decision = parsed.data
    const [saved] = await this.access.database.client<
      SubmissionRow[]
    >`update submissions set status=${decision.decision === "approve" ? "approved" : "rejected"},listed=${decision.decision === "approve" && this.access.config.COMMUNITY_ENABLED},reviewed_at=now(),reviewer_id=${actor.id},reason=${decision.decision === "reject" ? decision.reason : null} where id=${id} and status='pending' returning *`
    if (!saved) throw new ConflictException("投稿不存在或已审核，不能覆盖审核记录")
    return ownSubmissionView(saved)
  }
  async listing(actor: Actor, id: string, input: unknown) {
    await this.access.admin(actor)
    this.access.id(id)
    const parsed = z.strictObject({ listed: z.boolean() }).safeParse(input)
    if (!parsed.success) throw new BadRequestException("上架状态无效")
    if (parsed.data.listed) this.access.open()
    return this.access.database.client.begin(async (sql) => {
      const [saved] = await sql<
        SubmissionRow[]
      >`update submissions set listed=${parsed.data.listed} where id=${id} and status='approved' and delete_marked_at is null and deleted_at is null returning *`
      if (!saved) throw new NotFoundException("投稿未通过审核或文件已清理")
      const [audit] =
        await sql`insert into listing_changes(target_type,target_id,listed,actor_id) values('submission',${id},${parsed.data.listed},${actor.id}) returning id`
      if (!audit) throw new Error("投稿上下架审计写入失败")
      return ownSubmissionView(saved)
    })
  }
  async cleanupAsAdmin(actor: Actor) {
    await this.access.admin(actor)
    return this.cleanup()
  }
  async cleanup() {
    if (this.running) return { removed: 0, pending: 0 }
    this.running = true
    try {
      const rows = await this.access.database.client<
        SubmissionRow[]
      >`update submissions set delete_marked_at=coalesce(delete_marked_at,now()),cleanup_attempted_at=now(),listed=false where id in (select id from submissions where status='rejected' and reviewed_at<=now()-interval '30 days' and deleted_at is null order by cleanup_attempted_at nulls first,reviewed_at,id limit 50) returning *`
      let removed = 0,
        pending = 0
      for (const row of rows) {
        try {
          await this.storage.remove(row.object_key)
          const [saved] = await this.access.database
            .client`update submissions set deleted_at=now() where id=${row.id} and delete_marked_at is not null and deleted_at is null returning id`
          if (saved) removed++
        } catch {
          pending++
        }
      }
      return { removed, pending }
    } finally {
      this.running = false
    }
  }
}
