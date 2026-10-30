import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

import { describe, expect, it } from "vitest"

import { invalidProgressFixtures, validProgressFixtures } from "../../packages/core/src/progress/fixtures/index.ts"
import { progressFileSchema } from "../../packages/core/src/progress/schema.ts"

// ajv 声明在 packages/core 的 devDependencies；这里显式从 core 的 package.json 解析，
// 避免 pnpm 隔离布局下 tests/ 直接 import 不到。
const requireFromCore = createRequire(new URL("../../packages/core/package.json", import.meta.url))
const Ajv2020 = requireFromCore("ajv/dist/2020")
const addFormats = requireFromCore("ajv-formats")

const schemaUrl = new URL("../../apps/web/public/schemas/progress/v1/progress.schema.json", import.meta.url)
const openapiUrl = new URL("../../apps/web/public/openapi.json", import.meta.url)
const schema = JSON.parse(readFileSync(schemaUrl, "utf8"))

const ajv = new Ajv2020({ allErrors: true })
addFormats(ajv)
const validateWithAjv = ajv.compile(schema)

const fixtures = [
  ...validProgressFixtures.map((fixture) => ({ ...fixture, expected: true })),
  ...invalidProgressFixtures.map((fixture) => ({ ...fixture, expected: false })),
]

describe("公开契约 fixture", () => {
  it("fixture 组为 2 个有效 + 18 个无效", () => {
    expect(validProgressFixtures).toHaveLength(2)
    expect(invalidProgressFixtures).toHaveLength(18)
    expect(new Set(fixtures.map((fixture) => fixture.name)).size).toBe(fixtures.length)
  })

  for (const { name, value, expected } of fixtures) {
    it(`${expected ? "valid" : "invalid"}/${name} 的 ajv 结论与 zod 结论一致`, () => {
      const ajvResult = validateWithAjv(value)
      const zodResult = progressFileSchema.safeParse(value).success
      expect(ajvResult, JSON.stringify(validateWithAjv.errors)).toBe(expected)
      expect(zodResult, "zod 结论").toBe(expected)
      expect(ajvResult, "ajv 与 zod 必须一致").toBe(zodResult)
    })
  }

  it("生成的 JSON Schema 是 2020-12 且带公开地址", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
    expect(schema.$id).toBe("https://mykaoyan.cn/schemas/progress/v1/progress.schema.json")
  })

  it("生成的 OpenAPI 是 3.1，包含 GET/PUT、If-Match 与 ETag", () => {
    const openapi = JSON.parse(readFileSync(openapiUrl, "utf8"))
    expect(openapi.openapi).toBe("3.1.0")
    const path = openapi.paths["/api/v1/progress"]
    expect(path.get.responses["200"].headers.ETag).toBeTruthy()
    expect(path.get.responses["200"].content["application/json"].schema.$ref).toBe("#/components/schemas/ProgressFile")
    expect(path.put.parameters).toContainEqual(
      expect.objectContaining({ name: "If-Match", in: "header", required: true }),
    )
    expect(path.put.requestBody.content["application/json"].schema.$ref).toBe("#/components/schemas/ProgressFile")
    expect(path.put.responses["412"]).toBeTruthy()
    expect(path.put.responses["428"]).toBeTruthy()
    expect(openapi.components.schemas.ProgressFile).toBeTruthy()
  })

  it("PUT 200 返回变更摘要，GET/PUT 都声明两种认证方式", () => {
    const openapi = JSON.parse(readFileSync(openapiUrl, "utf8"))
    const path = openapi.paths["/api/v1/progress"]
    const expectedSecurity = [{ bearerAuth: [] }, { sessionCookie: [] }]

    expect(path.put.responses["200"].headers.ETag).toBeTruthy()
    expect(path.put.responses["200"].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/ProgressChangeSummary",
    )
    expect(path.get.security).toEqual(expectedSecurity)
    expect(path.put.security).toEqual(expectedSecurity)
    expect(openapi.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" })
    expect(openapi.components.securitySchemes.sessionCookie).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "better-auth.session_token",
    })
    expect(openapi.components.schemas.ProgressChangeSummary).toBeTruthy()
  })

  it("变更摘要组件用 ajv 校验：合法摘要通过、负条数拒绝", () => {
    const openapi = JSON.parse(readFileSync(openapiUrl, "utf8"))
    const validateSummary = ajv.compile({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...openapi.components.schemas.ProgressChangeSummary,
    })
    const summary = {
      app: "mykaoyan",
      version: 1,
      etag: '"revision-7"',
      changes: {
        added: { profile: 0, progress: 1, mistakes: 2, daily: 1, dayPlans: 0, weekly: 0 },
        updated: { profile: 1, progress: 0, mistakes: 0, daily: 0, dayPlans: 1, weekly: 0 },
        removed: { profile: 0, progress: 0, mistakes: 1, daily: 0, dayPlans: 0, weekly: 0 },
      },
    }
    expect(validateSummary(summary), JSON.stringify(validateSummary.errors)).toBe(true)

    const negative = JSON.parse(JSON.stringify(summary))
    negative.changes.added.mistakes = -1
    expect(validateSummary(negative)).toBe(false)
  })
})
