import { randomUUID } from "node:crypto"

import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"

import { SUBMISSION_PART_SIZE, submissionInputSchema, uploadPartSize } from "@mykaoyan/core"

import { SubmissionAccess } from "./access"
import type { SubmissionRow } from "./access"
import { SUBMISSION_STORAGE } from "./storage"
import type { SubmissionStorage } from "./storage"
@Injectable()
export class SubmissionUploads {
  constructor(
    @Inject(SubmissionAccess) private access: SubmissionAccess,
    @Inject(SUBMISSION_STORAGE) private storage: SubmissionStorage,
  ) {}
  async start(accountId: string, input: unknown) {
    this.access.open()
    const parsed = submissionInputSchema.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException(
        "投稿需填写标题、考试科目，视频须为mp4/H.264、不超过500MB及30分钟，考点须属于所选科目",
      )
    const v = parsed.data,
      sql = this.access.database.client
    await sql`insert into submissions(id,account_id,title,summary,subject_code,topic_id,size,duration,fingerprint,object_key) values(${v.id},${accountId},${v.title},${v.summary},${v.subjectCode},${v.topicId},${v.size},${v.duration},${v.fingerprint},${`submissions/${randomUUID()}/video.mp4`}) on conflict(id) do nothing`
    return sql.begin(async (tx) => {
      const [r] = await tx<
        SubmissionRow[]
      >`select * from submissions where id=${v.id} and account_id=${accountId} for update`
      if (!r) throw new NotFoundException("投稿不存在")
      if (
        r.kind !== "video" ||
        r.fingerprint !== v.fingerprint ||
        r.size !== v.size ||
        r.duration !== v.duration ||
        r.title !== v.title ||
        r.summary !== v.summary ||
        r.subject_code !== v.subjectCode ||
        r.topic_id !== v.topicId
      )
        throw new ConflictException("续传文件或投稿信息与原记录不符，请选择原文件或新建投稿")
      if (r.status !== "uploading") return this.access.ownView(r)
      if (!r.upload_id) {
        const uploadId = await this.storage.start(r.object_key!)
        const [saved] = await tx`update submissions set upload_id=${uploadId} where id=${r.id} returning id`
        if (!saved) throw new Error("上传编号保存失败")
      }
      return this.access.ownView(r)
    })
  }
  async resume(accountId: string, id: string) {
    this.access.open()
    const r = await this.access.owned(accountId, id)
    if (r.kind !== "video") throw new ConflictException("手稿没有上传流程")
    if (r.status !== "uploading" || !r.upload_id) throw new ConflictException("此投稿不在可续传状态")
    // 上次完成分片后响应丢失时，对象已存在；让浏览器重试完成登记。
    const head = await this.storage.head(r.object_key!)
    const parts = head ? [] : await this.storage.parts(r.object_key!, r.upload_id)
    return {
      ...(await this.access.ownView(r)),
      partSize: SUBMISSION_PART_SIZE,
      completed: !!head,
      parts: parts.map((p) => ({ number: p.number, size: p.size })),
    }
  }
  async sign(accountId: string, id: string, number: number) {
    this.access.open()
    const r = await this.access.owned(accountId, id)
    if (r.kind !== "video") throw new ConflictException("手稿没有上传流程")
    if (r.status !== "uploading" || !r.upload_id) throw new ConflictException("投稿已结束上传")
    let size: number
    try {
      size = uploadPartSize(r.size!, number)
    } catch {
      throw new BadRequestException("分片编号无效")
    }
    return { url: await this.storage.sign(r.object_key!, r.upload_id, number, size), size }
  }
  async finish(accountId: string, id: string) {
    this.access.open()
    this.access.id(id)
    return this.access.database.client.begin(async (sql) => {
      const [r] = await sql<
        SubmissionRow[]
      >`select * from submissions where id=${id} and account_id=${accountId} for update`
      if (!r) throw new NotFoundException("投稿不存在")
      if (r.kind !== "video") throw new ConflictException("手稿没有上传流程")
      if (r.status !== "uploading") return this.access.ownView(r)
      if (!r.upload_id) throw new ConflictException("请先初始化上传")
      let head = await this.storage.head(r.object_key!)
      if (!head) {
        const parts = (await this.storage.parts(r.object_key!, r.upload_id)).sort((a, b) => a.number - b.number)
        if (
          parts.length !== Math.ceil(r.size! / SUBMISSION_PART_SIZE) ||
          parts.some((p, i) => p.number !== i + 1 || p.size !== uploadPartSize(r.size!, i + 1))
        )
          throw new BadRequestException("分片缺失或大小不符，请续传原文件")
        await this.storage.complete(r.object_key!, r.upload_id, parts)
        head = await this.storage.head(r.object_key!)
      }
      if (!head || head.size !== r.size || head.type !== "video/mp4")
        throw new BadRequestException("对象大小或类型不符，投稿未登记")
      const [saved] = await sql<SubmissionRow[]>`update submissions set status='pending' where id=${id} returning *`
      if (!saved) throw new Error("投稿登记未返回记录")
      return this.access.ownView(saved)
    })
  }
}
