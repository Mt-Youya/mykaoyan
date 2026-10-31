import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { z } from "zod"

import { SUBMISSION_KINDS } from "@mykaoyan/core"

import { DEFAULT_TOKEN_TTL_SECONDS, MAX_TOKEN_TTL_SECONDS, PlaybackService } from "../playback"
import { RatingsService } from "../ratings"
import { ownSubmissionView, SubmissionAccess, submissionView } from "./access"
import type { Actor, SubmissionListRow } from "./access"
@Injectable()
export class SubmissionsService {
  constructor(
    @Inject(SubmissionAccess) private access: SubmissionAccess,
    @Inject(PlaybackService) private playback: PlaybackService,
    @Inject(RatingsService) private ratings: RatingsService,
  ) {}
  async list(subject: string, page: number, topic = "", kind = "") {
    if (kind && !(SUBMISSION_KINDS as readonly string[]).includes(kind))
      throw new BadRequestException("投稿形态须为video或manuscript")
    const result = await this.ratings.ranked(
      subject,
      page,
      topic,
      kind === "" ? null : (kind as "video" | "manuscript"),
    )
    return {
      ...result,
      items: result.items.map(({ submission, stats }) => ({ ...submissionView(submission), ...stats })),
    }
  }
  async mine(accountId: string, page: number) {
    this.access.page(page)
    const rows = await this.access.database.client<
      SubmissionListRow[]
    >`select id,account_id,kind,title,summary,subject_code,topic_id,size,duration,fingerprint,object_key,upload_id,status,listed,created_at,reviewed_at,reviewer_id,reason,delete_marked_at,cleanup_attempted_at,deleted_at,case when manuscript_markdown is null then null else octet_length(manuscript_markdown) end as manuscript_bytes from submissions where account_id=${accountId} order by created_at desc,id desc limit 51 offset ${page * 50}`
    return {
      enabled: this.access.config.COMMUNITY_ENABLED,
      items: await this.access.ownViews(rows.slice(0, 50)),
      hasMore: rows.length > 50,
    }
  }
  async adminList(actor: Actor, page: number) {
    await this.access.admin(actor)
    this.access.page(page)
    const rows = await this.access.database.client<
      SubmissionListRow[]
    >`select id,account_id,kind,title,summary,subject_code,topic_id,size,duration,fingerprint,object_key,upload_id,status,listed,created_at,reviewed_at,reviewer_id,reason,delete_marked_at,cleanup_attempted_at,deleted_at,case when manuscript_markdown is null then null else octet_length(manuscript_markdown) end as manuscript_bytes from submissions order by created_at desc,id desc limit 51 offset ${page * 50}`
    const sql = this.access.database.client
    const pageRows = rows.slice(0, 50)
    const changes = rows.length
      ? await sql<
          { target_id: string; actor_id: string; listed: boolean; created_at: string | Date }[]
        >`select distinct on(target_id) target_id,actor_id,listed,created_at from listing_changes where target_type='submission' and target_id in ${sql(rows.map((r) => r.id))} order by target_id,created_at desc,id desc`
      : []
    const subtitles = await this.access.subtitles(pageRows.map((row) => row.id))
    return {
      items: pageRows.map((r) => {
        const change = changes.find((c) => c.target_id === r.id)
        return {
          ...ownSubmissionView(r, subtitles.get(r.id) ?? []),
          subtitleCount: subtitles.get(r.id)?.length ?? 0,
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
    const r = await this.access.find(id)
    if (!r || r.status === "uploading" || r.delete_marked_at || r.deleted_at)
      throw new NotFoundException("投稿不存在或文件已清理")
    const publicVisible = this.access.publicVisible(r)
    // 审核员和本人可预览未上架内容；会员到期不影响查看既有投稿。
    if (!publicVisible && r.account_id !== actor?.id) {
      if (!actor) throw new NotFoundException("投稿不存在")
      await this.access.admin(actor)
    }
    if (r.kind === "manuscript") throw new ConflictException("手稿没有播放令牌")
    const subtitles = await this.access.subtitles([id])
    return {
      ...this.playback.signMedia(r.object_key!, viewer, parsed.data.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS),
      subtitles: (subtitles.get(id) ?? []).map(({ language, label }) => ({
        language,
        label,
        src: `/api/submissions/${id}/subtitles/${encodeURIComponent(language)}`,
      })),
    }
  }
}
