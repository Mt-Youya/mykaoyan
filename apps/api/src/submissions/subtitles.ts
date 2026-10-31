import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"

import { putSubmissionSubtitlesSchema } from "@mykaoyan/core"

import { ownSubmissionView, SubmissionAccess, toListRow } from "./access"
import type { Actor, SubmissionRow, SubtitleRow } from "./access"
import { prepareSubtitle, SubtitleParseError } from "./subtitle"
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/
type NormalizedTrack = {
  language: string
  label: string
  sourceFormat: "srt" | "vtt"
  vttContent: string
  bytes: number
}
/** 视频投稿的字幕：整体替换 0–2 条，服务端解析并统一存归一化 VTT。 */
@Injectable()
export class SubmissionSubtitles {
  constructor(@Inject(SubmissionAccess) private access: SubmissionAccess) {}
  /** 只有本人、未审核且未进入清理流程的视频投稿可以改字幕。 */
  private editable(row: SubmissionRow) {
    if (row.kind !== "video") throw new BadRequestException("手稿没有字幕")
    if (row.delete_marked_at || row.deleted_at) throw new ConflictException("投稿已在清理流程中，不能修改字幕")
    if (row.reviewed_at !== null) throw new ConflictException("已审核的投稿不能修改字幕")
  }
  private normalize(
    tracks: { language: string; label: string; format: "srt" | "vtt"; content: string }[],
    duration: number | null,
  ) {
    return tracks.map((track): NormalizedTrack => {
      try {
        const { vtt, bytes, durationMs } = prepareSubtitle(track.content, track.format)
        if (duration !== null && durationMs > Math.ceil(duration * 1000))
          throw new BadRequestException(`字幕「${track.label}」总时长超过视频时长`)
        return { language: track.language, label: track.label, sourceFormat: track.format, vttContent: vtt, bytes }
      } catch (error) {
        if (error instanceof BadRequestException) throw error
        if (error instanceof SubtitleParseError)
          throw new BadRequestException(`字幕「${track.label}」无法解析：${error.message}`)
        throw error
      }
    })
  }
  async put(accountId: string, id: string, input: unknown) {
    this.access.open()
    const parsed = putSubmissionSubtitlesSchema.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException(
        "字幕需为0到2条，每条含语言标签、显示名与SRT/VTT正文；语言不能重复且正文不超过256KiB",
      )
    const row = await this.access.owned(accountId, id)
    this.editable(row)
    const normalized = this.normalize(parsed.data.tracks, row.duration)
    return this.access.database.client.begin(async (tx) => {
      const [current] = await tx<
        SubmissionRow[]
      >`select * from submissions where id=${id} and account_id=${accountId} for update`
      if (!current) throw new NotFoundException("投稿不存在")
      this.editable(current)
      await tx`delete from submission_subtitles where submission_id=${id}`
      if (normalized.length) {
        const inserted = await tx<Pick<SubtitleRow, "language" | "label">[]>`insert into submission_subtitles ${tx(
          normalized.map((track) => ({
            submission_id: id,
            language: track.language,
            label: track.label,
            source_format: track.sourceFormat,
            vtt_content: track.vttContent,
            bytes: track.bytes,
          })),
        )} returning language,label`
        if (inserted.length !== normalized.length) throw new Error("字幕写入数量不符")
      }
      const meta = normalized
        .map((track) => ({ language: track.language, label: track.label }))
        .sort((a, b) => a.language.localeCompare(b.language))
      return ownSubmissionView(toListRow(current), meta)
    })
  }
  async remove(accountId: string, id: string, language: string) {
    this.access.open()
    const row = await this.access.owned(accountId, id)
    this.editable(row)
    if (!LANGUAGE_PATTERN.test(language)) throw new NotFoundException("字幕不存在")
    const deleted = await this.access.database.client<
      { language: string }[]
    >`delete from submission_subtitles where submission_id=${id} and language=${language} returning language`
    if (!deleted.length) throw new NotFoundException("字幕不存在")
    const remaining = await this.access.subtitles([id])
    return ownSubmissionView(toListRow(row), remaining.get(id) ?? [])
  }
  /** 已上架且社区开放时公开；未上架仅本人或管理员可取，且不下发清理中的投稿。 */
  async read(id: string, language: string, actor: Actor | null) {
    this.access.id(id)
    if (!LANGUAGE_PATTERN.test(language)) throw new NotFoundException("字幕不存在")
    const row = await this.access.find(id)
    if (!row || row.kind !== "video" || row.deleted_at || row.delete_marked_at)
      throw new NotFoundException("字幕不存在")
    if (!this.access.publicVisible(row)) {
      const own = actor !== null && row.account_id === actor.id
      if (!own && !(await this.access.isAdmin(actor))) throw new NotFoundException("字幕不存在")
    }
    const [subtitle] = await this.access.database.client<
      SubtitleRow[]
    >`select * from submission_subtitles where submission_id=${id} and language=${language}`
    if (!subtitle) throw new NotFoundException("字幕不存在")
    return subtitle
  }
}
