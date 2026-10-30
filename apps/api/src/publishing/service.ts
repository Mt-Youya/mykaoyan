import { createHash, randomUUID } from "node:crypto"

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"

import { publishHandoutSchema, publishLessonSchema, publishPaperSchema } from "@mykaoyan/core"
import type { PublishHandout, PublishLesson, PublishPaper } from "@mykaoyan/core"

import { DatabaseService } from "../database"
import { PUBLISH_STORAGE } from "./storage"
import type { PublishStorage } from "./storage"
type Actor = { id: string; role: string }
type Document = { input: PublishLesson; videoKey: string; subtitleKey: string | null }
type HandoutRow = {
  slug: string
  subject_code: string
  title: string
  markdown: string
  position: number
  listed: boolean
  updated_at: Date | string
}
type Job = {
  id: string
  document: Document
  content_hash: string
  base_hash: string | null
  completed_at: Date | null
  old_keys: string[]
}
type Lesson = {
  slug: string
  content_hash: string | null
  content_version: number
  listed: boolean
  video_key: string
  subtitle_key: string | null
}
type PaperRow = {
  id: string
  slug: string
  content_hash: string | null
  content_version: number
  listed: boolean
}
/** 讲义内容指纹：拼接顺序固定，客户端与服务端都可复算；不作为版本号。 */
function handoutHash(input: PublishHandout) {
  return createHash("sha256")
    .update([input.subjectCode, input.slug, input.title, String(input.position), input.markdown].join("\0"))
    .digest("hex")
}
/** 深排序对象键后的规范化 JSON：服务端与 CLI 用同一规则计算试卷指纹。 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    )
  return value
}
/** 试卷内容指纹：题目按发布顺序整体参与，答案与解析同样计入。 */
function paperHash(input: PublishPaper) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex")
}
/** 试卷题号必须严格升序；选择题必须有选项，非选择题不得带选项。 */
function validatePaperQuestions(input: PublishPaper) {
  let previous = 0
  for (const question of input.questions) {
    if (question.number <= previous) throw new BadRequestException("题号必须唯一且严格升序")
    previous = question.number
    const choice = question.type === "单选" || question.type === "多选"
    if (choice && !question.options) throw new BadRequestException("选择题必须有选项")
    if (!choice && question.options) throw new BadRequestException("非选择题不得带选项")
  }
}
@Injectable()
export class PublishingService {
  constructor(
    @Inject(DatabaseService) private database: DatabaseService,
    @Inject(PUBLISH_STORAGE) private storage: PublishStorage,
  ) {}
  private async authorize(actor: Actor) {
    const [account] = await this.database.client<{ role: string }[]>`select role from accounts where id=${actor.id}`
    if (actor.role !== "admin" || account?.role !== "admin") throw new ForbiddenException("只有管理员能发布课程")
  }
  private async lesson(slug: string) {
    return (
      await this.database.client<
        Lesson[]
      >`select slug,content_hash,content_version,listed,video_key,subtitle_key from lessons where slug=${slug}`
    )[0]
  }
  async prepare(actor: Actor, body: unknown) {
    await this.authorize(actor)
    const parsed = publishLessonSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException("发布内容格式无效")
    const input = parsed.data
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex")
    const current = await this.lesson(input.slug)
    if (current?.content_hash === hash) {
      await this.cleanup(input.slug)
      if (
        !(await this.storage.verify(current.video_key, input.video, "video/mp4")) ||
        (input.subtitle &&
          (!current.subtitle_key ||
            !(await this.storage.verify(current.subtitle_key, input.subtitle, "application/x-subrip"))))
      )
        throw new ConflictException("已登记对象缺失或内容不一致")
      return { id: null, unchanged: true, contentHash: hash, uploads: [] }
    }
    const id = randomUUID()
    const document: Document = {
      input,
      videoKey: `lessons/${input.slug}/${id}/video.mp4`,
      subtitleKey: input.subtitle ? `lessons/${input.slug}/${id}/subtitle.srt` : null,
    }
    const uploads = [{ kind: "video", ...(await this.storage.upload(document.videoKey, input.video, "video/mp4")) }]
    if (input.subtitle && document.subtitleKey)
      uploads.push({
        kind: "subtitle",
        ...(await this.storage.upload(document.subtitleKey, input.subtitle, "application/x-subrip")),
      })
    await this.database
      .client`insert into lesson_publications(id,account_id,document,content_hash,base_hash) values(${id},${actor.id},${JSON.stringify(document)}::jsonb,${hash},${current?.content_hash ?? null})`
    return { id, unchanged: false, contentHash: hash, uploads }
  }
  async complete(actor: Actor, id: string) {
    await this.authorize(actor)
    const [job] = await this.database.client<
      Job[]
    >`select * from lesson_publications where id=${id} and account_id=${actor.id}`
    if (!job) throw new NotFoundException("发布计划不存在")
    const { input, videoKey, subtitleKey } = job.document
    if (
      !(await this.storage.verify(videoKey, input.video, "video/mp4")) ||
      (input.subtitle &&
        (!subtitleKey || !(await this.storage.verify(subtitleKey, input.subtitle, "application/x-subrip"))))
    )
      throw new ConflictException("对象未上传或校验不符")
    if (!job.completed_at)
      await this.database.client.begin(async (sql) => {
        await sql`select pg_advisory_xact_lock(1,hashtext(${input.course.slug}))`
        await sql`select pg_advisory_xact_lock(2,hashtext(${input.slug}))`
        const [locked] = await sql<Job[]>`select * from lesson_publications where id=${id} for update`
        if (locked?.completed_at) return
        const [current] = await sql<
          Lesson[]
        >`select slug,content_hash,content_version,listed,video_key,subtitle_key from lessons where slug=${input.slug} for update`
        if ((current?.content_hash ?? null) !== job.base_hash)
          throw new ConflictException("内容已被其他发布修改，请重新生成发布计划")
        const [course] = await sql<
          { id: string }[]
        >`insert into courses(subject_code,slug,title,summary,position) values(${input.course.subjectCode},${input.course.slug},${input.course.title},'',0) on conflict(slug) do update set title=excluded.title,subject_code=excluded.subject_code returning id`
        if (!course) throw new Error("课程写入失败")
        const [chapter] = await sql<
          { id: string }[]
        >`insert into chapters(course_id,publish_key,title,position) values(${course.id},${input.chapter.slug},${input.chapter.title},${input.chapter.position}) on conflict(publish_key) do update set title=excluded.title,position=excluded.position where chapters.course_id=excluded.course_id returning id`
        if (!chapter) throw new ConflictException("章标识属于另一课程")
        const [saved] = await sql<
          { id: string }[]
        >`insert into lessons(chapter_id,slug,title,position,video_key,subtitle_key,script_markdown,content_hash,content_version) values(${chapter.id},${input.slug},${input.title},${input.position},${videoKey},${subtitleKey},${input.scriptMarkdown},${job.content_hash},1) on conflict(slug) do update set chapter_id=excluded.chapter_id,title=excluded.title,position=excluded.position,video_key=excluded.video_key,subtitle_key=excluded.subtitle_key,script_markdown=excluded.script_markdown,content_hash=excluded.content_hash,content_version=lessons.content_version+1,updated_at=now() returning id`
        if (!saved) throw new Error("讲写入失败")
        // 只删除本发布流程生成的旧对象；遗留对象来源不明时保留，避免误删共享文件。
        const old = [current?.video_key, current?.subtitle_key].filter(
          (key): key is string => !!key && key.startsWith(`lessons/${input.slug}/`),
        )
        await sql`update lesson_publications set completed_at=now(),old_keys=${JSON.stringify(old)}::jsonb where id=${id}`
      })
    const cleanupPending = await this.cleanup(input.slug)
    return { ...(await this.read(actor, input.slug)), cleanupPending }
  }
  private async cleanup(slug: string) {
    const jobs = await this.database.client<
      Job[]
    >`select * from lesson_publications where completed_at is not null and document->'input'->>'slug'=${slug} and jsonb_array_length(old_keys)>0`
    const pending = await Promise.all(
      jobs.map(async (job) => {
        const deleted = await Promise.allSettled(job.old_keys.map((key) => this.storage.remove(key)))
        const failed = deleted.some((result) => result.status === "rejected")
        if (!failed) await this.database.client`update lesson_publications set old_keys='[]'::jsonb where id=${job.id}`
        return failed
      }),
    )
    return pending.some(Boolean)
  }

  async read(actor: Actor, slug: string) {
    await this.authorize(actor)
    const row = await this.lesson(slug)
    if (!row) throw new NotFoundException("讲不存在")
    const [pending] = await this.database.client<
      { pending: boolean }[]
    >`select exists(select 1 from lesson_publications where completed_at is not null and document->'input'->>'slug'=${slug} and jsonb_array_length(old_keys)>0) as pending`
    return {
      slug,
      contentHash: row.content_hash,
      version: row.content_version,
      listed: row.listed,
      keys: [row.video_key, ...(row.subtitle_key ? [row.subtitle_key] : [])],
      cleanupPending: pending?.pending ?? false,
    }
  }

  /** 讲义发布：单请求写库；内容相同不写库；更新不改变上架状态。 */
  async publishHandout(actor: Actor, slug: string, body: unknown) {
    await this.authorize(actor)
    const parsed = publishHandoutSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException("讲义内容格式无效")
    const input = parsed.data
    if (input.slug !== slug) throw new BadRequestException("路径与内容的标识不一致")
    const hash = handoutHash(input)
    const [current] = await this.database.client<
      HandoutRow[]
    >`select slug,subject_code,title,markdown,position,listed,updated_at from handouts where slug=${slug}`
    if (
      current &&
      handoutHash({
        subjectCode: current.subject_code,
        slug: current.slug,
        title: current.title,
        position: current.position,
        markdown: current.markdown,
      }) === hash
    )
      return {
        slug,
        unchanged: true,
        listed: current.listed,
        contentHash: hash,
        updatedAt: new Date(current.updated_at).toISOString(),
      }
    const [saved] = await this.database.client<
      HandoutRow[]
    >`insert into handouts(subject_code,slug,title,markdown,position) values(${input.subjectCode},${input.slug},${input.title},${input.markdown},${input.position}) on conflict (slug) do update set subject_code=excluded.subject_code,title=excluded.title,markdown=excluded.markdown,position=excluded.position,updated_at=now() returning slug,subject_code,title,markdown,position,listed,updated_at`
    if (!saved) throw new Error("讲义写入未返回记录")
    return {
      slug: saved.slug,
      unchanged: false,
      listed: saved.listed,
      contentHash: hash,
      updatedAt: new Date(saved.updated_at).toISOString(),
    }
  }

  /** 试卷发布：事务内 upsert 试卷并整体替换题目；内容相同不写库；更新不改上架状态。 */
  async publishPaper(actor: Actor, slug: string, body: unknown) {
    await this.authorize(actor)
    const parsed = publishPaperSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException("试卷内容格式无效")
    const input = parsed.data
    if (input.slug !== slug) throw new BadRequestException("路径与内容的标识不一致")
    validatePaperQuestions(input)
    const hash = paperHash(input)
    const [current] = await this.database.client<
      PaperRow[]
    >`select id,slug,content_hash,content_version,listed from papers where slug=${slug}`
    if (current?.content_hash === hash)
      return {
        slug,
        unchanged: true,
        version: current.content_version,
        listed: current.listed,
        contentHash: hash,
        questionCount: input.questions.length,
      }
    const saved = await this.database.client.begin(async (tx) => {
      const [paper] = current
        ? await tx<
            PaperRow[]
          >`update papers set subject_code=${input.subjectCode},year=${input.year},title=${input.title},source_note=${input.sourceNote},position=${input.position},content_hash=${hash},content_version=content_version+1,updated_at=now() where slug=${slug} returning id,slug,content_hash,content_version,listed`
        : await tx<
            PaperRow[]
          >`insert into papers(subject_code,year,slug,title,source_note,position,owner_account_id,content_hash,content_version) values(${input.subjectCode},${input.year},${slug},${input.title},${input.sourceNote},${input.position},${actor.id},${hash},1) returning id,slug,content_hash,content_version,listed`
      if (!paper) throw new Error("试卷写入未返回记录")
      await tx`delete from paper_questions where paper_id=${paper.id}`
      for (const question of input.questions)
        await tx`insert into paper_questions(paper_id,number,type,score,topics,stem_markdown,options,answer_markdown,analysis_markdown) values(${paper.id},${question.number},${question.type},${question.score},${question.topics},${question.stemMarkdown},${question.options === null ? null : JSON.stringify(question.options)}::jsonb,${question.answerMarkdown},${question.analysisMarkdown})`
      return paper
    })
    if (!saved) throw new Error("试卷写入未返回记录")
    return {
      slug: saved.slug,
      unchanged: false,
      version: saved.content_version,
      listed: saved.listed,
      contentHash: hash,
      questionCount: input.questions.length,
    }
  }
}
