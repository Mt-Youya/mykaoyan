import { createHash, randomUUID } from "node:crypto"

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"

import { publishLessonSchema } from "@mykaoyan/core"
import type { PublishLesson } from "@mykaoyan/core"

import { DatabaseService } from "../database"
import { PUBLISH_STORAGE } from "./storage"
import type { PublishStorage } from "./storage"
type Actor = { id: string; role: string }
type Document = { input: PublishLesson; videoKey: string; subtitleKey: string | null }
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
}
