import { createHash, randomUUID } from "node:crypto"

import type { INestApplication } from "@nestjs/common"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { Test } from "@nestjs/testing"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { SUBMISSION_STORAGE } from "."
import type { SubmissionStorage, UploadedPart } from "."
import { AppModule } from "../app"
import type { MemorySmsVerifier } from "../auth"
import { PRIVACY_POLICY_VERSION, SMS_VERIFIER } from "../auth"
import { ProblemFilter } from "../common"
import { readEnvironment } from "../environment"
type Body = {
  id?: string
  kind?: string
  status?: string
  listed?: boolean
  manuscriptBytes?: number | null
  hasManuscript?: boolean
  hasSubtitles?: boolean
  subtitleLanguages?: string[]
  subtitles?: { language: string; label: string; src?: string }[]
  subtitleCount?: number
  deleted?: boolean
  markdown?: string
  items?: { id?: string; kind?: string; manuscriptBytes?: number | null; subtitleCount?: number }[]
  removed?: number
  pending?: number
} & Record<string, unknown>
type TestResponse = Omit<Response, "json"> & { json(): Promise<Body> }
class MemoryR2 implements SubmissionStorage {
  data = new Map<string, { parts: UploadedPart[]; object: { size: number; type: string } | null }>()
  async start(key: string) {
    this.data.set(key, { parts: [], object: null })
    return `fictional-${randomUUID()}`
  }
  async sign(key: string, _upload: string, number: number, size: number) {
    return `https://r2.example.invalid/${key}?number=${number}&size=${size}`
  }
  async parts(key: string) {
    return this.data.get(key)!.parts
  }
  async complete(key: string) {
    const r = this.data.get(key)!
    r.object = { size: r.parts.reduce((n, p) => n + p.size, 0), type: "video/mp4" }
  }
  async head(key: string) {
    return this.data.get(key)?.object ?? null
  }
  async remove(key: string) {
    if (!this.data.delete(key)) throw new Error("虚构对象删除失败")
  }
  put(url: string) {
    const u = new URL(url),
      r = this.data.get(u.pathname.slice(1))!,
      number = Number(u.searchParams.get("number"))
    r.parts = r.parts.filter((p) => p.number !== number)
    r.parts.push({ number, size: Number(u.searchParams.get("size")), etag: `"fictional-${number}"` })
  }
}
const srt = [
  "1",
  "00:00:01,000 --> 00:00:03,000",
  "第一句虚构字幕",
  "",
  "2",
  "00:00:04,000 --> 00:00:06,000",
  "第二句虚构字幕",
  "",
].join("\n")
describe("手稿与字幕 HTTP", () => {
  let app: INestApplication, off: INestApplication, origin: string, offOrigin: string, sql: ReturnType<typeof postgres>
  const storage = new MemoryR2()
  let admin: { id: string; cookie: string }, a: { id: string; cookie: string }, b: { id: string; cookie: string }
  const call = (
    path: string,
    cookie?: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    base = origin,
  ) =>
    fetch(`${base}/api/${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }) as Promise<TestResponse>
  const manuscript = (change = {}) => ({
    id: randomUUID(),
    kind: "manuscript",
    title: "虚构手稿投稿",
    summary: "虚构手稿简介",
    subjectCode: "302",
    topicId: "M01",
    manuscriptMarkdown: "虚构手稿正文：这里只放虚构内容，不含任何真实题目。",
    ...change,
  })
  const video = (change = {}) => ({
    id: randomUUID(),
    title: "虚构视频投稿",
    summary: "虚构简介",
    subjectCode: "302",
    topicId: "M01",
    size: 100,
    duration: 10,
    codec: "h264",
    contentType: "video/mp4",
    fingerprint: "a".repeat(64),
    ...change,
  })
  async function login(phone: string) {
    expect((await call("phone/request-code", undefined, { phone })).status).toBe(200)
    const response = await call("phone/verify", undefined, {
      phone,
      code: (app.get(SMS_VERIFIER) as MemorySmsVerifier).peekCode(`+86${phone}`),
      acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
      acceptedTermsVersion: "2026-10-30",
    })
    expect(response.status).toBe(200)
    const cookie = response.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .find((s) => s?.startsWith("better-auth.session_token="))!
    const [row] = await sql<{ id: string }[]>`select id from accounts where phone=${`+86${phone}`}`
    return { id: row!.id, cookie }
  }
  async function pendingVideo(owner = a, change = {}) {
    const v = video(change)
    expect((await call("submissions/uploads", owner.cookie, v)).status).toBe(201)
    const sign = await (await call(`submissions/${v.id}/parts/1`, owner.cookie, {})).json()
    storage.put(sign.url as string)
    expect((await call(`submissions/${v.id}/complete`, owner.cookie, {})).status).toBe(201)
    return v
  }
  async function approve(id: string) {
    expect((await call(`admin/submissions/${id}/review`, admin.cookie, { decision: "approve" })).status).toBe(201)
  }
  beforeAll(async () => {
    const db = new URL(process.env.DATABASE_URL!)
    if (!["localhost", "127.0.0.1"].includes(db.hostname) || db.pathname !== "/mykaoyan_test")
      throw new Error("只允许专用临时库")
    sql = postgres(db.href, { ssl: false, prepare: false })
    async function start(enabled: boolean) {
      const config = readEnvironment({
        ...process.env,
        NODE_ENV: "test",
        PORT: "3001",
        COMMUNITY_ENABLED: String(enabled),
        MEDIA_SIGNING_KEY: "fictional-materials-signing-key-32-characters",
      })
      const module = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
        .overrideProvider(SUBMISSION_STORAGE)
        .useValue(storage)
        .compile()
      // 与 createApp 一致：手稿正文接近 1 MiB，默认 100 kB 的 JSON 上限会在校验前拒绝。
      const server = module.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false })
      server.useBodyParser("json", { limit: "2mb" })
      server.useBodyParser("urlencoded", { limit: "2mb", extended: true })
      server.setGlobalPrefix("api")
      server.useGlobalFilters(new ProblemFilter(server.getHttpAdapter()))
      await server.listen(0, "127.0.0.1")
      return server
    }
    app = await start(true)
    origin = await app.getUrl()
    off = await start(false)
    offOrigin = await off.getUrl()
    admin = await login("18800002601")
    a = await login("18800002602")
    b = await login("18800002603")
    await sql`update accounts set role='admin' where id=${admin.id}`
  })
  afterAll(async () => {
    await off?.close()
    await app?.close()
    await sql?.end({ timeout: 1 })
  })
  it("手稿只要求登录：未登录401、社区关闭403、非会员提交即待审核", async () => {
    const v = manuscript()
    expect((await call("submissions/manuscripts", undefined, v)).status).toBe(401)
    expect((await call("submissions/manuscripts", a.cookie, manuscript(), "POST", offOrigin)).status).toBe(403)
    const created = await call("submissions/manuscripts", a.cookie, v)
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({
      id: v.id,
      kind: "manuscript",
      status: "pending",
      listed: false,
      duration: null,
      hasManuscript: true,
      manuscriptBytes: Buffer.byteLength(v.manuscriptMarkdown, "utf8"),
    })
    const [row] = await sql<
      {
        kind: string
        status: string
        size: number | null
        duration: number | null
        object_key: string | null
        upload_id: string | null
        manuscript_markdown: string | null
        fingerprint: string
      }[]
    >`select kind,status,size,duration,object_key,upload_id,manuscript_markdown,fingerprint from submissions where id=${v.id}`
    expect(row).toMatchObject({
      kind: "manuscript",
      status: "pending",
      size: null,
      duration: null,
      object_key: null,
      upload_id: null,
      manuscript_markdown: v.manuscriptMarkdown,
      fingerprint: createHash("sha256").update(v.manuscriptMarkdown, "utf8").digest("hex"),
    })
    // 相同 id 幂等返回同一条；内容不一致 409。
    expect(await (await call("submissions/manuscripts", a.cookie, v)).json()).toMatchObject({ id: v.id })
    expect(
      (await call("submissions/manuscripts", a.cookie, { ...v, manuscriptMarkdown: `${v.manuscriptMarkdown}改` }))
        .status,
    ).toBe(409)
    // 别人的 id 不暴露存在性。
    expect((await call("submissions/manuscripts", b.cookie, v)).status).toBe(404)
    expect((await call("submissions/manuscripts", undefined, manuscript({ title: "" }))).status).toBe(401)
    expect((await call("submissions/manuscripts", a.cookie, manuscript({ title: "" }))).status).toBe(400)
    expect(
      (await call("submissions/manuscripts", a.cookie, manuscript({ manuscriptMarkdown: "x".repeat(1_000_001) })))
        .status,
    ).toBe(400)
    expect(
      (
        await call(
          "submissions/manuscripts",
          a.cookie,
          manuscript({ manuscriptMarkdown: "中".repeat(Math.floor(1_048_576 / 3) + 1) }),
        )
      ).status,
    ).toBe(400)
    expect(
      (await call("submissions/manuscripts", a.cookie, manuscript({ manuscriptMarkdown: "正文\u0000" }))).status,
    ).toBe(400)
  })
  it("手稿待审核不公开；审核通过并上架后详情可读，列表只给字节数", async () => {
    const v = manuscript()
    await call("submissions/manuscripts", a.cookie, v)
    expect((await call(`submissions/${v.id}/manuscript`)).status).toBe(404)
    expect((await call(`submissions/${v.id}/manuscript`, b.cookie)).status).toBe(404)
    expect(await (await call(`submissions/${v.id}/manuscript`, a.cookie)).json()).toMatchObject({
      markdown: v.manuscriptMarkdown,
    })
    expect(await (await call(`submissions/${v.id}/manuscript`, admin.cookie)).json()).toMatchObject({
      markdown: v.manuscriptMarkdown,
    })
    expect((await call(`submissions/${v.id}/playback-token`, a.cookie, {})).status).toBe(409)
    const hidden = await (await call("submissions?subject=302")).json()
    expect(hidden.items?.some((item) => item.id === v.id)).toBe(false)
    const mine = await (await call("submissions/mine", a.cookie)).json()
    expect(mine.items?.find((item) => item.id === v.id)).toMatchObject({
      kind: "manuscript",
      hasManuscript: true,
      hasSubtitles: false,
      deleted: false,
    })
    await approve(v.id)
    const published = await (await call("submissions?subject=302")).json()
    const item = published.items?.find((entry) => entry.id === v.id)
    expect(item).toMatchObject({ kind: "manuscript", status: "approved", listed: true })
    expect(JSON.stringify(published)).not.toContain("虚构手稿正文：这里只放虚构内容")
    const read = await call(`submissions/${v.id}/manuscript`)
    expect(read.status).toBe(200)
    expect(read.headers.get("cache-control")).toBe("no-store")
    expect(await read.json()).toMatchObject({ markdown: v.manuscriptMarkdown })
    expect(await (await call("submissions?subject=302&kind=manuscript")).json()).toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: v.id })]),
    })
    expect(
      (await (await call("submissions?subject=302&kind=video")).json()).items?.some((entry) => entry.id === v.id),
    ).toBe(false)
    expect((await call("submissions?subject=302&kind=audio")).status).toBe(400)
    // 社区关闭时公开读取关闭，本人仍可读。
    expect((await call(`submissions/${v.id}/manuscript`, undefined, undefined, "GET", offOrigin)).status).toBe(404)
    expect((await call(`submissions/${v.id}/manuscript`, a.cookie, undefined, "GET", offOrigin)).status).toBe(200)
  })
  it("字幕仅本人可改：401、越权404、超2条400、时间轴与总时长校验、SRT归一化为VTT", async () => {
    const v = await pendingVideo()
    const tracks = { tracks: [{ language: "zh", label: "中文（简体）", format: "srt", content: srt }] }
    expect((await call(`submissions/${v.id}/subtitles`, undefined, tracks, "PUT")).status).toBe(401)
    expect((await call(`submissions/${v.id}/subtitles`, b.cookie, tracks, "PUT")).status).toBe(404)
    const three = {
      tracks: [
        { language: "zh", label: "中文", format: "srt", content: srt },
        { language: "en", label: "English", format: "srt", content: srt },
        { language: "ja", label: "日本語", format: "srt", content: srt },
      ],
    }
    expect((await call(`submissions/${v.id}/subtitles`, a.cookie, three, "PUT")).status).toBe(400)
    expect(
      (
        await call(
          `submissions/${v.id}/subtitles`,
          a.cookie,
          { tracks: [{ language: "zh", label: "中文", format: "srt", content: "不是字幕" }] },
          "PUT",
        )
      ).status,
    ).toBe(400)
    // 视频 10 秒，字幕结束时间 12 秒超过视频时长。
    expect(
      (
        await call(
          `submissions/${v.id}/subtitles`,
          a.cookie,
          {
            tracks: [
              {
                language: "zh",
                label: "中文",
                format: "srt",
                content: "1\n00:00:09,000 --> 00:00:12,000\n虚构\n",
              },
            ],
          },
          "PUT",
        )
      ).status,
    ).toBe(400)
    const saved = await call(`submissions/${v.id}/subtitles`, a.cookie, tracks, "PUT")
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({
      hasSubtitles: true,
      subtitleLanguages: ["zh"],
      subtitles: [{ language: "zh", label: "中文（简体）" }],
    })
    const [subtitle] = await sql<
      { source_format: string; vtt_content: string; bytes: number }[]
    >`select source_format,vtt_content,bytes from submission_subtitles where submission_id=${v.id}`
    expect(subtitle).toMatchObject({ source_format: "srt" })
    expect(subtitle!.vtt_content.startsWith("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n")).toBe(true)
    expect(subtitle!.bytes).toBe(Buffer.byteLength(subtitle!.vtt_content, "utf8"))
    const [size] = await sql<
      { ok: boolean }[]
    >`select octet_length(vtt_content)=bytes as ok from submission_subtitles where submission_id=${v.id}`
    expect(size?.ok).toBe(true)
    // 未上架时只有本人与管理员可取；访客 404。
    expect((await call(`submissions/${v.id}/subtitles/zh`)).status).toBe(404)
    expect((await call(`submissions/${v.id}/subtitles/zh`, b.cookie)).status).toBe(404)
    const own = await call(`submissions/${v.id}/subtitles/zh`, a.cookie)
    expect(own.status).toBe(200)
    expect(own.headers.get("content-type")).toContain("text/vtt")
    expect(own.headers.get("cache-control")).toBe("no-store")
    expect(own.headers.get("x-content-type-options")).toBe("nosniff")
    expect(await own.text()).toBe(subtitle!.vtt_content)
    expect((await call(`submissions/${v.id}/subtitles/zh`, admin.cookie)).status).toBe(200)
    const adminList = await (await call("admin/submissions", admin.cookie)).json()
    expect(adminList.items?.find((item) => item.id === v.id)).toMatchObject({
      kind: "video",
      subtitleCount: 1,
      hasManuscript: false,
    })
    await approve(v.id)
    // 审核通过并上架后：访客可取；本人不能再改。
    const publicRead = await call(`submissions/${v.id}/subtitles/zh`)
    expect(publicRead.status).toBe(200)
    expect((await call(`submissions/${v.id}/subtitles`, a.cookie, tracks, "PUT")).status).toBe(409)
    expect((await call(`submissions/${v.id}/subtitles/zh`, a.cookie, undefined, "DELETE")).status).toBe(409)
    const token = await (await call(`submissions/${v.id}/playback-token`, undefined, {})).json()
    expect(token.subtitles).toMatchObject([{ language: "zh", label: "中文（简体）" }])
    expect((token.subtitles as { src: string }[])[0]!.src).toBe(`/api/submissions/${v.id}/subtitles/zh`)
    expect((await call(`submissions/${v.id}/subtitles/zh`)).status).toBe(200)
    // 社区关闭时公开字幕关闭。
    expect((await call(`submissions/${v.id}/subtitles/zh`, undefined, undefined, "GET", offOrigin)).status).toBe(404)
    expect((await call(`submissions/${v.id}/subtitles`, a.cookie, tracks, "PUT", offOrigin)).status).toBe(403)
  })
  it("未审核视频可删除字幕；替换为两条时语言不重复", async () => {
    const v = await pendingVideo()
    const one = {
      tracks: [
        { language: "zh", label: "中文", format: "vtt", content: "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n虚构\n" },
      ],
    }
    expect((await call(`submissions/${v.id}/subtitles`, a.cookie, one, "PUT")).status).toBe(200)
    const two = {
      tracks: [
        { language: "zh", label: "中文", format: "srt", content: srt },
        { language: "en", label: "English", format: "srt", content: srt },
      ],
    }
    expect(await (await call(`submissions/${v.id}/subtitles`, a.cookie, two, "PUT")).json()).toMatchObject({
      subtitleLanguages: ["en", "zh"],
      hasSubtitles: true,
    })
    expect(
      (await call(`submissions/${v.id}/subtitles`, a.cookie, { tracks: [two.tracks[0], two.tracks[0]] }, "PUT")).status,
    ).toBe(400)
    expect(await (await call(`submissions/${v.id}/subtitles/zh`, a.cookie, undefined, "DELETE")).json()).toMatchObject({
      subtitleLanguages: ["en"],
      hasSubtitles: true,
    })
    expect((await call(`submissions/${v.id}/subtitles/zh`, a.cookie)).status).toBe(404)
    expect((await call(`submissions/${v.id}/subtitles/en`, b.cookie, undefined, "DELETE")).status).toBe(404)
    expect(await (await call(`submissions/${v.id}/subtitles`, a.cookie, { tracks: [] }, "PUT")).json()).toMatchObject({
      hasSubtitles: false,
      subtitleLanguages: [],
    })
    expect((await call(`submissions/${v.id}/subtitles/en`, a.cookie)).status).toBe(404)
  })
  it("驳回满30天清理：视频删字幕、手稿清空正文，审核记录与本人状态保留", async () => {
    const videoItem = await pendingVideo()
    await call(
      `submissions/${videoItem.id}/subtitles`,
      a.cookie,
      { tracks: [{ language: "zh", label: "中文", format: "srt", content: srt }] },
      "PUT",
    )
    const manuscriptItem = manuscript()
    await call("submissions/manuscripts", a.cookie, manuscriptItem)
    for (const id of [videoItem.id, manuscriptItem.id])
      expect(
        (await call(`admin/submissions/${id}/review`, admin.cookie, { decision: "reject", reason: "虚构驳回原因" }))
          .status,
      ).toBe(201)
    // 先清掉可能残留的到期内容，再让本用例的两条驳回记录到期。
    await call("admin/submissions/cleanup", admin.cookie, {})
    await sql`update submissions set reviewed_at=now()-interval '31 days' where id in ${sql([videoItem.id, manuscriptItem.id])}`
    const cleaned = await (await call("admin/submissions/cleanup", admin.cookie, {})).json()
    // 同一临时库可能还有其它测试文件遗留的到期投稿；只断言本用例的两条被清理。
    expect(cleaned.removed).toBeGreaterThanOrEqual(2)
    expect((await call(`submissions/${videoItem.id}/subtitles/zh`, a.cookie)).status).toBe(404)
    const [subtitleCount] = await sql<
      { n: number }[]
    >`select count(*)::integer as n from submission_subtitles where submission_id=${videoItem.id}`
    expect(subtitleCount?.n).toBe(0)
    const [videoRow] = await sql<
      { deleted_at: string | null }[]
    >`select deleted_at from submissions where id=${videoItem.id}`
    expect(videoRow?.deleted_at).not.toBeNull()
    const [manuscriptRow] = await sql<
      { deleted_at: string | null; manuscript_markdown: string | null }[]
    >`select deleted_at,manuscript_markdown from submissions where id=${manuscriptItem.id}`
    expect(manuscriptRow).toMatchObject({ manuscript_markdown: null })
    expect(manuscriptRow?.deleted_at).not.toBeNull()
    expect((await call(`submissions/${manuscriptItem.id}/manuscript`, a.cookie)).status).toBe(404)
    expect((await call(`submissions/${manuscriptItem.id}/manuscript`, admin.cookie)).status).toBe(404)
    const mine = await (await call("submissions/mine", a.cookie)).json()
    expect(mine.items?.find((item) => item.id === manuscriptItem.id)).toMatchObject({
      kind: "manuscript",
      deleted: true,
      hasManuscript: true,
      manuscriptBytes: null,
      status: "rejected",
    })
    expect(mine.items?.find((item) => item.id === videoItem.id)).toMatchObject({
      deleted: true,
      hasSubtitles: false,
      subtitleLanguages: [],
    })
  })
})
