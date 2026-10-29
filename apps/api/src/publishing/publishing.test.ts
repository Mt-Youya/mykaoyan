import { createHash, randomUUID } from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "node:http"
import { Test } from "@nestjs/testing"
import { beforeAll, afterAll, describe, it, expect } from "vitest"
import postgres from "postgres"
import { publishPreparedSchema, publishResultSchema } from "@mykaoyan/core"
import { AppModule } from "../app"
import { readEnvironment } from "../environment"
import { ProblemFilter } from "../common"
import { PUBLISH_STORAGE, PublishingService } from "./index"
import type { PublishStorage } from "./storage"
import { AgentTokensService } from "../agent-tokens"

class FakeStorage implements PublishStorage {
  objects = new Map<string, { size: number; md5: string; type: string }>()
  signed: string[] = []
  removed: string[] = []
  base = "https://example.invalid"
  failDelete = false
  async upload(key: string, asset: { size: number; md5: string }, type: string) {
    this.signed.push(key)
    return { url: `${this.base}/${key}`, headers: { "Content-MD5": asset.md5, "Content-Type": type } }
  }
  async verify(key: string, asset: { size: number; md5: string }, type: string) {
    const found = this.objects.get(key)
    return found?.size === asset.size && found.md5 === asset.md5 && found.type === type
  }
  async remove(key: string) {
    if (this.failDelete) throw new Error("虚构删除失败")
    this.removed.push(key)
    this.objects.delete(key)
  }
  accept(plan: { uploads: { url: string; headers: Record<string, string> }[] }) {
    for (const upload of plan.uploads)
      this.objects.set(new URL(upload.url).pathname.slice(1), {
        size: 32,
        md5: upload.headers["Content-MD5"]!,
        type: upload.headers["Content-Type"]!,
      })
  }
}
const input = {
  course: { slug: "fictional-course-publish", title: "虚构课程", subjectCode: "302" },
  chapter: { slug: "fictional-chapter-publish", title: "虚构章", position: 1 },
  slug: `fictional-publish-${randomUUID()}`,
  title: "虚构讲",
  position: 1,
  scriptMarkdown: "虚构讲稿",
  video: { sha256: "a".repeat(64), md5: "AAAAAAAAAAAAAAAAAAAAAA==", size: 32 },
  subtitle: { sha256: "b".repeat(64), md5: "AAAAAAAAAAAAAAAAAAAAAA==", size: 32 },
}
describe("管理员发布 HTTP 与对象生命周期", () => {
  let app: import("@nestjs/common").INestApplication
  let origin: string
  let sql: ReturnType<typeof postgres>
  let adminId: string
  let adminToken: string
  let ordinaryToken: string
  const storage = new FakeStorage()
  const call = (path: string, body?: unknown, token = adminToken) =>
    fetch(`${origin}/api/v1/publish/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  beforeAll(async () => {
    const config = readEnvironment({
      ...process.env,
      NODE_ENV: "test",
      PORT: "3001",
      MEDIA_SIGNING_KEY: "x".repeat(32),
    })
    const url = new URL(config.DATABASE_URL!)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test")
      throw new Error("只允许本机专用临时库")
    sql = postgres(config.DATABASE_URL!, { ssl: false, prepare: false })
    const module = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
      .overrideProvider(PUBLISH_STORAGE)
      .useValue(storage)
      .compile()
    app = module.createNestApplication({ logger: false })
    app.setGlobalPrefix("api")
    app.useGlobalFilters(new ProblemFilter(app.getHttpAdapter()))
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
    adminId = randomUUID()
    await sql`insert into accounts(id,name,email,role) values(${adminId},'虚构管理员',${`${adminId}@example.invalid`},'admin')`
    const tokens = app.get(AgentTokensService)
    adminToken = (await tokens.create(adminId, "虚构发布令牌", "publish")).token
    ordinaryToken = (await tokens.create(adminId, "虚构普通令牌")).token
  })
  afterAll(async () => {
    if (sql && adminId) await sql`delete from lesson_publications where account_id=${adminId}`
    await app?.close()
    await sql?.end({ timeout: 1 })
  })
  it("普通令牌、吊销令牌、被撤销管理员角色都不能发布，服务层也拒绝非管理员", async () => {
    expect((await call("prepare", input, ordinaryToken)).status).toBe(403)
    const accountId = randomUUID()
    await sql`insert into accounts(id,name,email,role) values(${accountId},'虚构账号',${`${accountId}@example.invalid`},'account')`
    await expect(app.get(AgentTokensService).create(accountId, "越权发布", "publish")).rejects.toThrow()
    await expect(app.get(PublishingService).prepare({ id: accountId, role: "admin" }, input)).rejects.toThrow()
    await sql`update accounts set role='account' where id=${adminId}`
    expect((await call("prepare", input)).status).toBe(403)
    await sql`update accounts set role='admin' where id=${adminId}`
    const revoked = await app.get(AgentTokensService).create(adminId, "待吊销", "publish")
    await app.get(AgentTokensService).revoke(adminId, revoked.id)
    expect((await call("prepare", input, revoked.token)).status).toBe(401)
    expect(
      (await fetch(`${origin}/api/v1/progress`, { headers: { authorization: `Bearer ${adminToken}` } })).status
    ).toBe(401)
  })
  it("上传前不写讲，首次发布后逐个校验 key，重复发布不新增版本或签名，下架状态保留", async () => {
    const prepared = await call("prepare", input)
    expect(prepared.status).toBe(201)
    const plan = publishPreparedSchema.parse(await prepared.json())
    expect((await call(`${plan.id}/complete`, {})).status).toBe(409)
    expect((await call("lessons/" + input.slug)).status).toBe(404)
    storage.accept(plan)
    const completed = await call(`${plan.id}/complete`, {})
    expect(completed.status).toBe(201)
    const result = publishResultSchema.parse(await completed.json())
    expect(result).toMatchObject({ version: 1, listed: false })
    for (const key of result.keys) expect(storage.objects.has(key)).toBe(true)
    const signatures = storage.signed.length
    expect(await (await call("prepare", input)).json()).toMatchObject({ unchanged: true, uploads: [] })
    expect(storage.signed).toHaveLength(signatures)
    expect(await (await call("lessons/" + input.slug)).json()).toMatchObject({ version: 1 })
    await sql`update lessons set listed=true where slug=${input.slug}`
    await sql`update lessons set listed=false where slug=${input.slug}`
    const changed = { ...input, title: "虚构新标题" }
    const next = publishPreparedSchema.parse(await (await call("prepare", changed)).json())
    storage.accept(next)
    storage.failDelete = true
    const saved = publishResultSchema.parse(await (await call(`${next.id}/complete`, {})).json())
    expect(saved).toMatchObject({ listed: false, version: 2, cleanupPending: true })
    // 删除失败不能回滚已经登记的新内容；重试完成可清理旧对象，不新增版本。
    expect(await (await call("lessons/" + input.slug)).json()).toMatchObject({ cleanupPending: true })
    // 同内容重发也会重试清理；若仍失败，读回继续准确报告。
    expect(await (await call("prepare", changed)).json()).toMatchObject({ unchanged: true })
    expect(await (await call("lessons/" + input.slug)).json()).toMatchObject({ cleanupPending: true })
    storage.failDelete = false
    const retried = await (await call(`${next.id}/complete`, {})).json()
    expect(retried).toMatchObject({ listed: false, version: 2, cleanupPending: false })
    for (const key of saved.keys) expect(storage.objects.has(key)).toBe(true)
    for (const key of result.keys) expect(storage.removed).toContain(key)
  })
  it("同一个新讲的跨课程并发发布只有一个成功，不能绕过内容基线", async () => {
    const slug = `concurrent-${randomUUID()}`
    const prepare = async () => {
      const request = {
        ...input,
        slug,
        course: { ...input.course, slug: `course-${randomUUID()}` },
        chapter: { ...input.chapter, slug: `chapter-${randomUUID()}` },
      }
      const plan = publishPreparedSchema.parse(await (await call("prepare", request)).json())
      storage.accept(plan)
      return plan
    }
    const [a, b] = await Promise.all([prepare(), prepare()])
    const results = await Promise.all([call(`${a.id}/complete`, {}), call(`${b.id}/complete`, {})])
    expect(results.map((r) => r.status).toSorted()).toEqual([201, 409])
    expect(await (await call("lessons/" + slug)).json()).toMatchObject({ version: 1 })
  })
  it("拒绝客户端指定上架状态和未知计划", async () => {
    expect((await call("prepare", { ...input, listed: true })).status).toBe(400)
    expect((await call(`${randomUUID()}/complete`, {})).status).toBe(404)
  })
  it("Rust CLI 对真实 API 和隔离对象服务发布、重复发布、替换并读回，保持下架", async () => {
    const execute = promisify(execFile)
    const manifest = fileURLToPath(new URL("../../../../cli/Cargo.toml", import.meta.url))
    await execute("cargo", ["build", "--manifest-path", manifest, "--locked"])
    const binary = fileURLToPath(
      new URL(`../../../../cli/target/debug/mykaoyan${process.platform === "win32" ? ".exe" : ""}`, import.meta.url)
    )
    let puts = 0
    const server = createServer(async (req, res) => {
      if (req.method !== "PUT" || req.headers.authorization) {
        res.writeHead(403)
        res.end()
        return
      }
      const buffers: Buffer[] = []
      for await (const chunk of req) buffers.push(Buffer.from(chunk))
      const bytes = Buffer.concat(buffers),
        md5 = createHash("md5").update(bytes).digest("base64")
      if (md5 !== req.headers["content-md5"]) {
        res.writeHead(400)
        res.end()
        return
      }
      puts++
      storage.objects.set(req.url!.slice(1), { size: bytes.length, md5, type: String(req.headers["content-type"]) })
      res.writeHead(200)
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address() as { port: number }
    storage.base = `http://127.0.0.1:${address.port}`
    const directory = await mkdtemp(join(tmpdir(), "mykaoyan-publish-"))
    const chapter = join(directory, `数学二/01-虚构发布-${randomUUID()}`)
    const run = async () =>
      JSON.parse(
        (
          await execute(binary, ["--json", "--origin", origin, "publish", chapter], {
            env: { ...process.env, MYKAOYAN_TOKEN: adminToken },
          })
        ).stdout
      )
    try {
      for (const kind of ["视频", "字幕", "讲稿"]) await mkdir(join(chapter, kind), { recursive: true })
      await writeFile(join(chapter, "视频/01-虚构讲.mp4"), "fictional-video")
      await writeFile(join(chapter, "字幕/01-虚构讲.srt"), "fictional-subtitle")
      await writeFile(join(chapter, "讲稿/01-虚构讲.md"), "虚构讲稿")
      await writeFile(join(chapter, "视频/答案.mp4"), "never-upload")
      const first = await run()
      expect(puts).toBe(2)
      expect(first.skipped).toEqual(["视频/答案.mp4"])
      const slug = first.published[0].slug
      await sql`update lessons set listed=false where slug=${slug}`
      const second = await run()
      expect(puts).toBe(2)
      expect(second.published[0]).toMatchObject({ unchanged: true, version: 1, listed: false })
      await writeFile(join(chapter, "视频/01-虚构讲.mp4"), "fictional-video-replaced")
      const third = await run()
      expect(puts).toBe(4)
      expect(third.published[0]).toMatchObject({ unchanged: false, version: 2, listed: false })
      for (const key of third.published[0].keys) expect(storage.objects.has(key)).toBe(true)
      for (const key of first.published[0].keys) expect(storage.objects.has(key)).toBe(false)
    } finally {
      storage.base = "https://example.invalid"
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(directory, { recursive: true, force: true })
    }
  }, 180_000)
})
