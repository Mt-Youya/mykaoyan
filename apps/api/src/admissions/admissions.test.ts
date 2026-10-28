import "reflect-metadata"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ProblemFilter } from "../common"
import { AdmissionsModule } from "./admissions.module"
import { ChsiClient } from "./client"
import { AdmissionsService, CHSI_CLIENT } from "./service"

/**
 * 招生目录查询（研招网桩）。
 *
 * 上游响应形状取自 2026-10-27 的实测样本，学校、专业与科目一律是虚构值。
 */
type Reply = { status?: number; body: string }
type Handler = (url: URL, body: URLSearchParams) => Reply

const json = (value: unknown): Reply => ({ body: JSON.stringify(value) })
const page = (list: unknown[], totalCount = list.length) =>
  json({ flag: true, msg: { totalCount, pageCount: 10, curPage: 1, list } })
const subject = (kskmdm: string, kskmmc: string) => ({ kskmdm, kskmmc, cksm: "见招生简章" })
// oxlint-disable-next-line typescript/no-explicit-any -- 断言里按路径取字段
const read = (response: Response) => response.json() as Promise<any>
const ok = async () => new Response("{}")
const RECORD_ID = "0123456789abcdef0123456789abcdef"

const majorRow = (zydm: string) => ({
  dwdm: "99999",
  dwmc: "示例大学",
  zydm,
  zymc: `示例专业 ${zydm}`,
  xwlx: zydm.startsWith("0854") ? "zyxw" : "xs",
  yjxkdm: zydm.slice(0, 4),
  yjxkmc: "示例类别",
  sign: "upstream-only",
})

const recordRow = {
  id: RECORD_ID,
  zyyjfxdm: "999990010854040001",
  dwdm: "99999",
  dwmc: "示例大学",
  yxsdm: "001",
  yxsmc: "示例学院",
  zydm: "085404",
  zymc: "计算机技术",
  yjfxdm: "00",
  yjfxmc: "不区分研究方向",
  xxfs: "1",
  kskmz: [
    {
      km1Vo: subject("101", "思想政治理论"),
      km2Vo: subject("204", "英语（二）"),
      km3Vo: subject("302", "数学（二）"),
      km4Vo: subject("408", "计算机学科专业基础"),
    },
    {
      km1Vo: subject("101", "思想政治理论"),
      km2Vo: subject("203", "日语"),
      km3Vo: subject("302", "数学（二）"),
      km4Vo: subject("408", "计算机学科专业基础"),
    },
  ],
}

const jointExamRow = {
  ...recordRow,
  id: "fedcba9876543210fedcba9876543210",
  zydm: "125100",
  zymc: "工商管理",
  xxfs: "2",
  kskmz: [
    {
      km1Vo: subject("199", "管理类综合能力"),
      km2Vo: subject("204", "英语（二）"),
      km3Vo: subject("-", "无"),
      km4Vo: subject("--", "无"),
    },
  ],
}

const routes: Record<string, Handler> = {
  "GET /zsml/": () => ({ body: '<script>var data = { curYear: "2027" }</script>' }),
  "GET /zsml/code/autodw.do": (url) =>
    json(
      url.searchParams.get("q") === "示例"
        ? [
            { dwdm: "99999", dwmc: "示例大学" },
            { dwdm: "", dwmc: "缺代码" },
          ]
        : []
    ),
  "POST /zsml/rs/dwzys.do": () =>
    page(
      Array.from({ length: 10 }, (_, index) => majorRow(`0854${String(index).padStart(2, "0")}`)),
      37
    ),
  "POST /zsml/rs/yjfxs.do": (_, body) =>
    body.get("zydm") === "085404" ? page([recordRow]) : body.get("zydm") === "125100" ? page([jointExamRow]) : page([]),
}

describe("招生目录查询", () => {
  let app: INestApplication
  let origin: string
  let calls: string[]
  let override: Handler | undefined

  const stub: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const key = `${init?.method ?? "GET"} ${url.pathname}`
    calls.push(key)
    const body = new URLSearchParams(typeof init?.body === "string" ? init.body : "")
    const handler = override ?? routes[key]
    if (!handler) return new Response("not found", { status: 404 })
    const reply = handler(url, body)
    return new Response(reply.body, { status: reply.status ?? 200 })
  }

  beforeEach(async () => {
    calls = []
    override = undefined
    const moduleRef = await Test.createTestingModule({ imports: [AdmissionsModule] })
      .overrideProvider(CHSI_CLIENT)
      .useValue(new ChsiClient({ fetch: stub, minIntervalMs: 0, sleep: async () => {} }))
      .compile()
    app = moduleRef.createNestApplication({ logger: false })
    app.setGlobalPrefix("api")
    app.useGlobalFilters(new ProblemFilter(app.getHttpAdapter()))
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
  })

  afterEach(async () => await app?.close())

  const get = (path: string) => fetch(`${origin}/api/admissions${path}`)

  it("年度取自目录页面自述的 curYear", async () => {
    const response = await get("/year")
    expect(response.status).toBe(200)
    expect(await read(response)).toMatchObject({ year: 2027, stale: false })
  })

  it("按名称查找招生单位，丢弃缺少官方代码的行；没有匹配时返回空列表而不是错误", async () => {
    const found = await get(`/units?keyword=${encodeURIComponent("示例")}`)
    expect((await read(found)).units).toEqual([{ code: "99999", name: "示例大学" }])
    const empty = await get(`/units?keyword=${encodeURIComponent("不存在")}`)
    expect(empty.status).toBe(200)
    expect((await read(empty)).units).toEqual([])
  })

  it("招生专业只有前 10 个时明确标出截断，并且不返回上游内部字段", async () => {
    const response = await get("/units/99999/majors?year=2027")
    expect(response.status).toBe(200)
    const body = await read(response)
    expect(body.coverage).toEqual({ total: 37, returned: 10, truncated: true })
    expect(body.majors[0]).toEqual({
      code: "085400",
      name: "示例专业 085400",
      degree: "professional",
      discipline: { code: "0854", name: "示例类别" },
    })
    expect(JSON.stringify(body)).not.toContain("upstream-only")
  })

  it("保留「或」选考的多个科目组，管理类联考的占位不算作科目", async () => {
    const response = await get("/records?year=2027&unit=99999&major=085404")
    const [record] = (await read(response)).records
    expect(record.groups.map((group: { subjects: { code: string }[] }) => group.subjects.map((s) => s.code))).toEqual([
      ["101", "204", "302", "408"],
      ["101", "203", "302", "408"],
    ])
    expect(record).toMatchObject({
      college: { code: "001", name: "示例学院" },
      direction: { code: "00", name: "不区分研究方向" },
      mode: "full_time",
      sourceUrl: `https://yz.chsi.com.cn/zsml/yjfxdetail?id=${RECORD_ID}`,
    })
    expect(record).not.toHaveProperty("zyyjfxdm")

    const joint = await read(await get("/records?year=2027&unit=99999&major=125100&mode=part_time"))
    expect(joint.records[0].mode).toBe("part_time")
    expect(joint.records[0].groups).toEqual([
      {
        subjects: [
          { code: "199", name: "管理类综合能力" },
          { code: "204", name: "英语（二）" },
        ],
      },
    ])
  })

  it("按学科类别筛选专业时把四位代码传给上游，筛选结果单独缓存", async () => {
    const sent: Record<string, string>[] = []
    await get("/year")
    override = (url, body) => {
      sent.push(Object.fromEntries(body))
      return routes["POST /zsml/rs/dwzys.do"]!(url, body)
    }
    expect((await get("/units/99999/majors?year=2027&discipline=0854")).status).toBe(200)
    await get("/units/99999/majors?year=2027")
    await get("/units/99999/majors?year=2027&discipline=0854")
    expect(sent).toEqual([
      { dwdm: "99999", start: "0", curPage: "1", pageSize: "10", yjxkdm: "0854" },
      { dwdm: "99999", start: "0", curPage: "1", pageSize: "10" },
    ])
  })

  it("只传代码给上游，学习方式按上游取值转换", async () => {
    let sent: URLSearchParams | undefined
    await get("/year")
    override = (url, body) => {
      sent = body
      return routes["POST /zsml/rs/yjfxs.do"]!(url, body)
    }
    await get("/records?year=2027&unit=99999&major=125100&mode=part_time")
    expect(Object.fromEntries(sent!)).toEqual({ dwdm: "99999", zydm: "125100", start: "0", pageSize: "10", xxfs: "2" })
  })

  it("请求其他年度返回 409，不拿当前目录冒充", async () => {
    const response = await get("/records?year=2026&unit=99999&major=085404")
    expect(response.status).toBe(409)
    expect(response.headers.get("content-type")).toContain("application/problem+json")
    expect((await read(response)).title).toContain("2027")
    expect(calls).not.toContain("POST /zsml/rs/yjfxs.do")
  })

  it("没有招生条目时返回空列表，不报错", async () => {
    const response = await get("/records?year=2027&unit=99999&major=081200")
    expect(response.status).toBe(200)
    expect(await read(response)).toMatchObject({ records: [], coverage: { total: 0, returned: 0, truncated: false } })
  })

  it("相同查询命中缓存，只请求一次上游", async () => {
    await get("/records?year=2027&unit=99999&major=085404")
    await get("/records?year=2027&unit=99999&major=085404")
    expect(calls.filter((call) => call === "POST /zsml/rs/yjfxs.do")).toHaveLength(1)
    expect(calls.filter((call) => call === "GET /zsml/")).toHaveLength(1)
  })

  it.each([
    ["HTTP 200 的「请登录」", json({ flag: false, msg: "请登录" }), 502, "登录"],
    ["HTTP 200 的 HTML 登录页", { body: "<html>统一身份认证</html>" }, 502, "登录页"],
    ["403 风控", { status: 403, body: "403 Forbidden (操作被拒绝)" }, 502, "拒绝"],
    ["持续 503", { status: 503, body: "busy" }, 502, "无法访问"],
  ])("%s 不当作空结果", async (_, reply, status, title) => {
    await get("/year")
    override = () => reply
    const response = await get("/records?year=2027&unit=99999&major=085404")
    expect(response.status).toBe(status)
    expect((await read(response)).title).toContain(title)
  })

  it("参数非法时返回 400，不请求上游", async () => {
    const paths = [
      "/units",
      "/units?keyword=a",
      "/units/1000/majors?year=2027",
      "/units/99999/majors",
      "/units/99999/majors?year=2027&discipline=085",
      "/units/99999/majors?year=2027&discipline=08A4",
      "/records?year=2027&unit=99999&major=08540",
      "/records?year=2027&unit=99999&major=085404&mode=weekend",
    ]
    const responses = await Promise.all(paths.map(get))
    responses.forEach((response, index) => expect(response.status, paths[index]).toBe(400))
    expect(calls).toEqual([])
  })

  it("没有任意地址转发的入口", async () => {
    const response = await get(`/proxy?url=${encodeURIComponent("https://example.com")}`)
    expect(response.status).toBe(404)
  })
})

describe("研招网客户端", () => {
  it("上游失败时沿用缓存的旧结果并标记 stale", async () => {
    let fail = false
    let now = Date.now()
    const realNow = Date.now
    Date.now = () => now
    try {
      const moduleRef = await Test.createTestingModule({ imports: [AdmissionsModule] })
        .overrideProvider(CHSI_CLIENT)
        .useValue(
          new ChsiClient({
            fetch: async () => (fail ? new Response("down", { status: 503 }) : new Response('{ curYear: "2027" }')),
            minIntervalMs: 0,
            sleep: async () => {},
          })
        )
        .compile()
      const service = moduleRef.get(AdmissionsService)
      expect(await service.catalogYear()).toMatchObject({ year: 2027, stale: false })
      fail = true
      now += 7 * 60 * 60 * 1000
      expect(await service.catalogYear()).toMatchObject({ year: 2027, stale: true })
    } finally {
      Date.now = realNow
    }
  })

  it("排队超过上限时直接拒绝，不继续堆积上游请求", async () => {
    const { promise: gate, resolve: release } = Promise.withResolvers<void>()
    const client = new ChsiClient({
      fetch: async () => {
        await gate
        return new Response("{}")
      },
      minIntervalMs: 0,
      maxPending: 2,
      sleep: async () => {},
    })
    const first = client.text({ path: "/zsml/", method: "GET" })
    const second = client.text({ path: "/zsml/", method: "GET" })
    await expect(client.text({ path: "/zsml/", method: "GET" })).rejects.toMatchObject({ failure: "busy" })
    release()
    await Promise.all([first, second])
    await expect(client.text({ path: "/zsml/", method: "GET" })).resolves.toBe("{}")
  })

  it("请求之间保持最小间隔", async () => {
    const waits: number[] = []
    const client = new ChsiClient({ fetch: ok, minIntervalMs: 1200, sleep: async (ms) => void waits.push(ms) })
    await client.text({ path: "/zsml/", method: "GET" })
    await client.text({ path: "/zsml/", method: "GET" })
    expect(waits).toHaveLength(1)
    expect(waits[0]).toBeGreaterThan(1000)
  })
})
