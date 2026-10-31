import { randomUUID } from "node:crypto"

import type { INestApplication } from "@nestjs/common"
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
type TestResponse = Omit<Response, "json"> & {
  json(): Promise<{
    url: string
    size: number
    token: string
    videoKey: string
    parts: { number: number; size: number }[]
    items: { id: string; status: string }[]
  }>
}
class MemoryR2 implements SubmissionStorage {
  data = new Map<string, { parts: UploadedPart[]; object: { size: number; type: string } | null }>()
  loseCompleteResponse = false
  failRemove = false
  failKeys = new Set<string>()
  beforeRemove: (() => Promise<void>) | null = null
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
    if (this.loseCompleteResponse) {
      this.loseCompleteResponse = false
      throw new Error("虚构完成响应丢失")
    }
  }
  async head(key: string) {
    return this.data.get(key)?.object ?? null
  }
  async remove(key: string) {
    await this.beforeRemove?.()
    if (this.failRemove || this.failKeys.has(key)) throw new Error("虚构对象删除失败")
    this.data.delete(key)
  }
  put(url: string, size?: number) {
    const u = new URL(url),
      r = this.data.get(u.pathname.slice(1))!,
      number = Number(u.searchParams.get("number"))
    r.parts = r.parts.filter((p) => p.number !== number)
    r.parts.push({ number, size: size ?? Number(u.searchParams.get("size")), etag: `"fictional-${number}"` })
  }
}
describe("投稿上传、审核和清理 HTTP", () => {
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
  const input = (change = {}) => ({
    id: randomUUID(),
    title: "虚构投稿",
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
    const [r] = await sql<{ id: string }[]>`select id from accounts where phone=${`+86${phone}`}`
    return { id: r!.id, cookie }
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
        MEDIA_SIGNING_KEY: "fictional-submission-signing-key-32-characters",
      })
      const module = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
        .overrideProvider(SUBMISSION_STORAGE)
        .useValue(storage)
        .compile()
      const server = module.createNestApplication({ logger: false })
      server.setGlobalPrefix("api")
      server.useGlobalFilters(new ProblemFilter(server.getHttpAdapter()))
      await server.listen(0, "127.0.0.1")
      return server
    }
    app = await start(true)
    origin = await app.getUrl()
    off = await start(false)
    offOrigin = await off.getUrl()
    admin = await login("18800002201")
    a = await login("18800002202")
    b = await login("18800002203")
    await sql`update accounts set role='admin' where id=${admin.id}`
  })
  afterAll(async () => {
    await off?.close()
    await app?.close()
    await sql?.end({ timeout: 1 })
  })
  async function pending(change = {}) {
    const v = input(change)
    expect((await call("submissions/uploads", a.cookie, v)).status).toBe(201)
    const sign = await (await call(`submissions/${v.id}/parts/1`, a.cookie, {})).json()
    storage.put(sign.url)
    expect((await call(`submissions/${v.id}/complete`, a.cookie, {})).status).toBe(201)
    return v
  }
  it("默认开关同时关闭公开读取与上传；上传只要求登录，不再要求会员", async () => {
    expect(await (await call("submissions?subject=302", undefined, undefined, "GET", offOrigin)).json()).toMatchObject({
      enabled: false,
      items: [],
    })
    expect((await call("submissions/uploads", undefined, input())).status).toBe(401)
    expect((await call("submissions/uploads", a.cookie, input())).status).toBe(201)
    expect((await call("submissions/uploads", a.cookie, input(), "POST", offOrigin)).status).toBe(403)
    expect((await call("submissions/uploads", a.cookie, input({ size: 500000001 }))).status).toBe(400)
    expect((await call("submissions/uploads", a.cookie, input({ subjectCode: "408" }))).status).toBe(400)
  })
  it("断点续传绑定本人和原文件，不能读取、签名、完成别人的上传", async () => {
    const v = input({ size: 8388618 })
    expect((await call("submissions/uploads", a.cookie, v)).status).toBe(201)
    for (const [path, body] of [
      [`submissions/${v.id}/upload`, undefined],
      [`submissions/${v.id}/parts/1`, {}],
      [`submissions/${v.id}/complete`, {}],
    ] as const)
      expect((await call(path, b.cookie, body)).status).toBe(404)
    expect((await call("submissions/uploads", b.cookie, v)).status).toBe(404)
    expect((await call("submissions/uploads", a.cookie, { ...v, fingerprint: "b".repeat(64) })).status).toBe(409)
    const sign = await (await call(`submissions/${v.id}/parts/1`, a.cookie, {})).json()
    storage.put(sign.url)
    const resumed = await (await call(`submissions/${v.id}/upload`, a.cookie)).json()
    expect(resumed.parts).toEqual([{ number: 1, size: 8388608 }])
    expect((await call(`submissions/${v.id}/complete`, a.cookie, {})).status).toBe(400)
    const last = await (await call(`submissions/${v.id}/parts/2`, a.cookie, {})).json()
    expect(last.size).toBe(10)
    storage.put(last.url)
    expect((await call(`submissions/${v.id}/parts/3`, a.cookie, {})).status).toBe(400)
    storage.loseCompleteResponse = true
    expect((await call(`submissions/${v.id}/complete`, a.cookie, {})).status).toBe(500)
    expect(await (await call(`submissions/${v.id}/complete`, a.cookie, {})).json()).toMatchObject({
      status: "pending",
      listed: false,
    })
    expect((await call("submissions/mine", b.cookie)).status).toBe(200)
    expect(JSON.stringify(await (await call("submissions/mine", b.cookie)).json())).not.toContain(v.id)
  })
  it("完成登记核实对象元数据，不信客户端完成声明", async () => {
    const v = input()
    await call("submissions/uploads", a.cookie, v)
    const sign = await (await call(`submissions/${v.id}/parts/1`, a.cookie, {})).json()
    storage.put(sign.url, 99)
    expect((await call(`submissions/${v.id}/complete`, a.cookie, {})).status).toBe(400)
    storage.put(sign.url)
    const key = new URL(sign.url).pathname.slice(1)
    storage.data.get(key)!.object = { size: 100, type: "application/octet-stream" }
    expect((await call(`submissions/${v.id}/complete`, a.cookie, {})).status).toBe(400)
    expect(
      (await (await call("submissions/mine", a.cookie)).json()).items.find((r: { id: string }) => r.id === v.id)
        ?.status,
    ).toBe("uploading")
  })
  it("先审核后公开，管理员可下架，投稿播放复用HMAC令牌且关闭时不向访客签发", async () => {
    const v = await pending()
    expect((await call(`submissions/${v.id}/playback-token`, undefined, {})).status).toBe(404)
    expect((await call(`submissions/${v.id}/playback-token`, b.cookie, {})).status).toBe(403)
    expect((await call(`submissions/${v.id}/playback-token`, a.cookie, {})).status).toBe(201)
    for (const cookie of [undefined, b.cookie]) {
      expect((await call("admin/submissions", cookie)).status).toBe(cookie ? 403 : 401)
      expect((await call(`admin/submissions/${v.id}/review`, cookie, { decision: "approve" })).status).toBe(
        cookie ? 403 : 401,
      )
      expect((await call(`admin/submissions/${v.id}/listing`, cookie, { listed: true }, "PUT")).status).toBe(
        cookie ? 403 : 401,
      )
      expect((await call("admin/submissions/cleanup", cookie, {})).status).toBe(cookie ? 403 : 401)
    }
    expect(
      await (await call(`admin/submissions/${v.id}/review`, admin.cookie, { decision: "approve" })).json(),
    ).toMatchObject({ status: "approved", listed: true })
    const token = await (await call(`submissions/${v.id}/playback-token`, undefined, {})).json()
    expect(JSON.parse(Buffer.from(token.token.split(".")[0]!, "base64url").toString())).toMatchObject({
      v: 1,
      key: token.videoKey,
    })
    const pub = await (await call("submissions?subject=302")).json()
    expect(pub.items.some((r: { id: string }) => r.id === v.id)).toBe(true)
    expect(JSON.stringify(pub)).not.toContain("object_key")
    expect((await call(`submissions/${v.id}/playback-token`, undefined, {}, "POST", offOrigin)).status).toBe(404)
    expect((await call(`admin/submissions/${v.id}/listing`, admin.cookie, { listed: false }, "PUT")).status).toBe(200)
    expect(
      (await (await call("admin/submissions", admin.cookie)).json()).items.find((r) => r.id === v.id),
    ).toMatchObject({ listingChange: { listed: false, actorId: admin.id } })
    expect((await call(`submissions/${v.id}/playback-token`, undefined, {})).status).toBe(404)
    expect(
      (await call(`admin/submissions/${v.id}/review`, admin.cookie, { decision: "reject", reason: "重审" })).status,
    ).toBe(409)
  })
  it("驳回必须原因，30天前不删除，先持久标记再删对象，失败重试且保留审核记录", async () => {
    const v = await pending()
    expect(
      (await call(`admin/submissions/${v.id}/review`, admin.cookie, { decision: "reject", reason: " " })).status,
    ).toBe(400)
    await call(`admin/submissions/${v.id}/review`, admin.cookie, { decision: "reject", reason: "虚构驳回原因" })
    expect(await (await call("admin/submissions/cleanup", admin.cookie, {})).json()).toMatchObject({ removed: 0 })
    await sql`update submissions set reviewed_at=now()-interval '30 days' where id=${v.id}`
    storage.beforeRemove = async () => {
      const list = await (await call("admin/submissions", admin.cookie)).json()
      expect(list.items.find((r: { id: string }) => r.id === v.id)).toMatchObject({
        deleteMarked: true,
        deleted: false,
        reason: "虚构驳回原因",
      })
      expect((await call(`submissions/${v.id}/playback-token`, a.cookie, {})).status).toBe(404)
    }
    storage.failRemove = true
    expect(await (await call("admin/submissions/cleanup", admin.cookie, {})).json()).toMatchObject({
      removed: 0,
      pending: 1,
    })
    storage.failRemove = false
    expect(await (await call("admin/submissions/cleanup", admin.cookie, {})).json()).toMatchObject({
      removed: 1,
      pending: 0,
    })
    expect(
      (await (await call("submissions/mine", a.cookie)).json()).items.find((r: { id: string }) => r.id === v.id),
    ).toMatchObject({ deleted: true, status: "rejected", reason: "虚构驳回原因" })
    storage.beforeRemove = null
  })
  it("会员到期不影响上传，历史投稿仍可查看", async () => {
    const v = input()
    expect((await call("submissions/uploads", a.cookie, v)).status).toBe(201)
    expect((await call("submissions/uploads", a.cookie, input())).status).toBe(201)
    expect((await call("submissions/mine", a.cookie)).status).toBe(200)
    expect(
      (await (await call("submissions/mine", a.cookie)).json()).items.some((r: { id: string }) => r.id === v.id),
    ).toBe(true)
  })
  it("失败的清理批次不阻塞后续到期文件", async () => {
    const ids: string[] = []
    for (let n = 0; n < 51; n++) {
      const id = randomUUID(),
        key = `submissions/fictional-cleanup-${id}/video.mp4`
      ids.push(id)
      storage.data.set(key, { parts: [], object: { size: 100, type: "video/mp4" } })
      if (n < 50) storage.failKeys.add(key)
      await sql`insert into submissions(id,account_id,title,summary,subject_code,size,duration,fingerprint,object_key,status,reviewed_at,reviewer_id,reason) values(${id},${a.id},'虚构清理队列','','302',100,10,${"a".repeat(64)},${key},'rejected',now()-interval '31 days'+${n}*interval '1 second',${admin.id},'虚构驳回')`
    }
    expect(await (await call("admin/submissions/cleanup", admin.cookie, {})).json()).toMatchObject({
      removed: 0,
      pending: 50,
    })
    expect(await (await call("admin/submissions/cleanup", admin.cookie, {})).json()).toMatchObject({
      removed: 1,
      pending: 49,
    })
    storage.failKeys.clear()
  })
})
