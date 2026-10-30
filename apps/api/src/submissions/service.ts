import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { z } from "zod"

import { DEFAULT_TOKEN_TTL_SECONDS, MAX_TOKEN_TTL_SECONDS, PlaybackService } from "../playback"
import { RatingsService } from "../ratings"
import { ownSubmissionView, SubmissionAccess, submissionView } from "./access"
import type { Actor, SubmissionRow } from "./access"
@Injectable()
export class SubmissionsService {
  constructor(
    @Inject(SubmissionAccess) private access: SubmissionAccess,
    @Inject(PlaybackService) private playback: PlaybackService,
    @Inject(RatingsService) private ratings: RatingsService,
  ) {}
  async list(subject: string, page: number, topic = "") {
    const result = await this.ratings.ranked(subject, page, topic)
    return {
      ...result,
      items: result.items.map(({ submission, stats }) => ({ ...submissionView(submission), ...stats })),
    }
  }
  async mine(accountId: string, page: number) {
    this.access.page(page)
    const rows = await this.access.database.client<
      SubmissionRow[]
    >`select * from submissions where account_id=${accountId} order by created_at desc,id desc limit 51 offset ${page * 50}`
    return {
      enabled: this.access.config.COMMUNITY_ENABLED,
      items: rows.slice(0, 50).map(ownSubmissionView),
      hasMore: rows.length > 50,
    }
  }
  async adminList(actor: Actor, page: number) {
    await this.access.admin(actor)
    this.access.page(page)
    const rows = await this.access.database.client<
      SubmissionRow[]
    >`select * from submissions order by created_at desc,id desc limit 51 offset ${page * 50}`
    const sql = this.access.database.client
    const changes = rows.length
      ? await sql<
          { target_id: string; actor_id: string; listed: boolean; created_at: string | Date }[]
        >`select distinct on(target_id) target_id,actor_id,listed,created_at from listing_changes where target_type='submission' and target_id in ${sql(rows.map((r) => r.id))} order by target_id,created_at desc,id desc`
      : []
    return {
      items: rows.slice(0, 50).map((r) => {
        const change = changes.find((c) => c.target_id === r.id)
        return {
          ...ownSubmissionView(r),
          reviewerId: r.reviewer_id,
          listingChange: change
            ? { actorId: change.actor_id, listed: change.listed, at: new Date(change.created_at).toISOString() }
            : null,
        }
      }),
      hasMore: rows.length > 50,
    }
  }
  async token(id: string, actor: Actor | null, viewer: string, input: unknown) {
    this.access.id(id)
    const parsed = z
      .strictObject({ ttlSeconds: z.number().int().min(1).max(MAX_TOKEN_TTL_SECONDS).optional() })
      .safeParse(input ?? {})
    if (!parsed.success) throw new BadRequestException("播放令牌有效期无效")
    const [r] = await this.access.database.client<SubmissionRow[]>`select * from submissions where id=${id}`
    if (!r || r.status === "uploading" || r.delete_marked_at || r.deleted_at)
      throw new NotFoundException("投稿不存在或文件已清理")
    const publicVisible = this.access.config.COMMUNITY_ENABLED && r.status === "approved" && r.listed
    // 审核员和本人可预览未上架内容；会员到期不影响查看既有投稿。
    if (!publicVisible && r.account_id !== actor?.id) {
      if (!actor) throw new NotFoundException("投稿不存在")
      await this.access.admin(actor)
    }
    return this.playback.signMedia(r.object_key, viewer, parsed.data.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS)
  }
}
