import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "."
import { readEnvironment } from "../environment"

const TEST_ENV = {
  ...process.env,
  NODE_ENV: "test",
  PORT: "3001",
  MEDIA_SIGNING_KEY: "test-media-signing-key-at-least-32-chars",
}

describe("健康检查 HTTP 接口（真实 Postgres）", () => {
  let app: Awaited<ReturnType<typeof createApp>>
  let origin: string

  beforeAll(async () => {
    const config = readEnvironment({ ...TEST_ENV })
    const url = new URL(config.DATABASE_URL!)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test") {
      throw new Error("集成测试只允许专用的本机 mykaoyan_test 临时库")
    }
    app = await createApp(config)
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
  })

  afterAll(async () => {
    await app?.close()
  })

  it("查询数据库成功后才返回 200，并能处理并发检查", async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => fetch(`${origin}/api/health`)))
    await Promise.all(
      responses.map(async (response) => {
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ status: "ok", database: "connected" })
      }),
    )
  })

  it("不存在的路径使用 problem+json", async () => {
    const response = await fetch(`${origin}/api/missing`)
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toContain("application/problem+json")
  })

  it("数据库不可用时返回 503，且响应不包含连接配置", async () => {
    const database = new URL(process.env.DATABASE_URL!)
    database.pathname = "/mykaoyan_missing_test"
    const config = readEnvironment({ ...TEST_ENV, DATABASE_URL: database.href })
    const unavailable = await createApp(config)
    try {
      await unavailable.listen(0, "127.0.0.1")
      const response = await fetch(`${await unavailable.getUrl()}/api/health`)
      expect(response.status).toBe(503)
      expect(response.headers.get("content-type")).toContain("application/problem+json")
      expect(await response.json()).toEqual({ type: "about:blank", title: "数据库暂不可用", status: 503 })
    } finally {
      await unavailable.close()
    }
  })
})

describe("未配置数据库", () => {
  it("只装配不需要数据库的模块，启动不连库；课程/讲义返回空列表，招生目录接口仍在", async () => {
    const environment: Record<string, string | undefined> = { ...TEST_ENV }
    delete environment.DATABASE_URL
    const app = await createApp(readEnvironment(environment))
    await app.listen(0, "127.0.0.1")
    try {
      const origin = await app.getUrl()
      expect((await fetch(`${origin}/api/health`)).status).toBe(404)
      for (const path of ["/api/courses?subject=408", "/api/handouts?subject=302"]) {
        const response = await fetch(`${origin}${path}`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual([])
      }
      expect((await fetch(`${origin}/api/courses/example`)).status).toBe(404)
      // 招生目录控制器仍在装配中；非法 keyword 在服务层之前被拒，不会请求上游。
      expect((await fetch(`${origin}/api/admissions/units?keyword=a`)).status).toBe(400)
    } finally {
      await app.close()
    }
  })
})
