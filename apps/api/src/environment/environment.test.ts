import { describe, expect, it } from "vitest"
import { StartupConfigError } from "../common"
import { readEnvironment } from "./environment"

const database = new URL("postgresql://database.invalid")
database.port = "6543"
database.searchParams.set("sslmode", "verify-full")
const valid = {
  NODE_ENV: "development",
  PORT: "3001",
  DATABASE_URL: database.href,
  MEDIA_SIGNING_KEY: "test-media-signing-key-at-least-32-chars",
}

describe("启动配置", () => {
  it.each(["NODE_ENV", "PORT", "MEDIA_SIGNING_KEY"])("拒绝缺失或空串 %s，且错误不暴露配置值", (key) => {
    for (const value of [undefined, ""]) {
      expect(() => readEnvironment({ ...valid, [key]: value })).toThrow(key)
      expect(() => readEnvironment({ ...valid, [key]: value })).not.toThrow(database.href)
    }
  })

  it("未配置 DATABASE_URL 时可以不连库启动；空串仍无效，生产必须配置", () => {
    const { DATABASE_URL: _omitted, ...withoutDatabase } = valid
    expect(readEnvironment(withoutDatabase).DATABASE_URL).toBeUndefined()
    expect(() => readEnvironment({ ...valid, DATABASE_URL: "" })).toThrow("DATABASE_URL")
    expect(() => readEnvironment({ ...withoutDatabase, NODE_ENV: "production" })).toThrow("DATABASE_URL")
  })

  it("配置错误使用可识别的 StartupConfigError，启动入口据此与端口占用区分", () => {
    expect(() => readEnvironment({ ...valid, PORT: undefined })).toThrow(StartupConfigError)
  })

  it("社区开关未设置时关闭，空串和其他值拒绝启动", () => {
    expect(readEnvironment(valid).COMMUNITY_ENABLED).toBe(false)
    expect(readEnvironment({ ...valid, COMMUNITY_ENABLED: "true" }).COMMUNITY_ENABLED).toBe(true)
    for (const value of ["", "1", "yes"])
      expect(() => readEnvironment({ ...valid, COMMUNITY_ENABLED: value })).toThrow("COMMUNITY_ENABLED")
  })

  it("接受显式配置并解析端口", () => {
    expect(readEnvironment(valid).PORT).toBe(3001)
  })

  it("拒绝用 test 模式关闭远程库 TLS，且可选 CA 不能是空串", () => {
    expect(() => readEnvironment({ ...valid, NODE_ENV: "test" })).toThrow("DATABASE_URL")
    expect(() => readEnvironment({ ...valid, DATABASE_CA: "" })).toThrow("DATABASE_CA")
  })

  it.each(["0", "65536", "abc", "1.5"])("拒绝非法端口 %s", (PORT) => {
    expect(() => readEnvironment({ ...valid, PORT })).toThrow("PORT")
  })

  it("开发和生产连接必须验证 TLS 且使用事务连接池端口", () => {
    const wrong = new URL(database)
    wrong.searchParams.set("sslmode", "require")
    expect(() => readEnvironment({ ...valid, DATABASE_URL: wrong.href })).toThrow("DATABASE_URL")
    wrong.searchParams.set("sslmode", "verify-full")
    wrong.port = "5432"
    expect(() => readEnvironment({ ...valid, DATABASE_URL: wrong.href })).toThrow("DATABASE_URL")
  })
})
