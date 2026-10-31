import { createHash } from "node:crypto"

import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"

import { manuscriptSubmissionInputSchema } from "@mykaoyan/core"

import { SubmissionAccess } from "./access"
import type { Actor, SubmissionRow } from "./access"
/** 手稿：单请求写入 Markdown 正文，直接进入待审核；没有 R2 对象与续传流程。 */
@Injectable()
export class SubmissionManuscripts {
  constructor(@Inject(SubmissionAccess) private access: SubmissionAccess) {}
  async create(accountId: string, input: unknown) {
    this.access.open()
    const parsed = manuscriptSubmissionInputSchema.safeParse(input)
    if (!parsed.success)
      throw new BadRequestException(
        "手稿需填写标题、考试科目与正文；正文不超过100万字符及1MiB，考点须属于所选科目，且不能包含NUL字符",
      )
    const value = parsed.data
    const fingerprint = createHash("sha256").update(value.manuscriptMarkdown, "utf8").digest("hex")
    const sql = this.access.database.client
    // 相同 id 的重复提交不覆盖原记录；后续在事务里核对内容一致才返回。
    await sql`insert into submissions(id,account_id,kind,title,summary,subject_code,topic_id,manuscript_markdown,fingerprint,status) values(${value.id},${accountId},'manuscript',${value.title},${value.summary},${value.subjectCode},${value.topicId},${value.manuscriptMarkdown},${fingerprint},'pending') on conflict(id) do nothing`
    return sql.begin(async (tx) => {
      const [row] = await tx<SubmissionRow[]>`select * from submissions where id=${value.id} for update`
      if (!row || row.account_id !== accountId) throw new NotFoundException("投稿不存在")
      if (
        row.kind !== "manuscript" ||
        row.fingerprint !== fingerprint ||
        row.title !== value.title ||
        row.summary !== value.summary ||
        row.subject_code !== value.subjectCode ||
        row.topic_id !== value.topicId
      )
        throw new ConflictException("投稿编号已被使用；相同内容重试请保持请求不变")
      return this.access.ownView(row)
    })
  }
  /** 手稿正文：已上架且社区开放时公开；否则仅本人或管理员可取。 */
  async read(id: string, actor: Actor | null) {
    this.access.id(id)
    const row = await this.access.find(id)
    if (!row || row.kind !== "manuscript" || row.deleted_at || row.manuscript_markdown === null)
      throw new NotFoundException("手稿不存在或已清理")
    const visible = this.access.publicVisible(row)
    if (!visible) {
      const own = actor !== null && row.account_id === actor.id
      if (!own && !(await this.access.isAdmin(actor))) throw new NotFoundException("手稿不存在")
    }
    return { markdown: row.manuscript_markdown }
  }
}
