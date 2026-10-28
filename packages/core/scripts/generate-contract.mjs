#!/usr/bin/env node
/**
 * 由 packages/core 的 zod 定义生成公开契约产物：
 * - apps/web/public/schemas/progress/v1/progress.schema.json
 * - apps/web/public/openapi.json
 *
 * 产物提交进仓库；CI 重新生成后必须没有差异。
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { progressChangeSummarySchema } from "../src/progress/change-summary"
import { progressFileSchema } from "../src/progress/schema"

const SCHEMA_URL = "https://mykaoyan.cn/schemas/progress/v1/progress.schema.json"
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

const { $schema, ...progressSchemaBody } = z.toJSONSchema(progressFileSchema, { io: "input" })
const progressSchema = { $schema, $id: SCHEMA_URL, ...progressSchemaBody }
const { $schema: _changeSummaryDialect, ...changeSummarySchemaBody } = z.toJSONSchema(progressChangeSummarySchema, {
  io: "input",
})

const progressContent = { "application/json": { schema: { $ref: "#/components/schemas/ProgressFile" } } }
const changeSummaryContent = {
  "application/json": { schema: { $ref: "#/components/schemas/ProgressChangeSummary" } },
}
const security = [{ bearerAuth: [] }, { sessionCookie: [] }]
const etagHeader = {
  description: "当前文档的版本标识；PUT 时作为 If-Match 回传。",
  schema: { type: "string" },
}
const unauthorized = { description: "未登录，或 Agent 令牌缺失、无效。" }

const openapi = {
  openapi: "3.1.0",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: {
    title: "我的考研公开契约",
    version: "1.0.0",
    description: [
      "进度文件格式与公开接口说明。契约只有一个来源：packages/core 的 zod 定义，由脚本生成 JSON Schema 与 OpenAPI。",
      `进度文件 JSON Schema：${SCHEMA_URL}`,
      "文档页：https://mykaoyan.cn/docs/contract",
      "版本规则：兼容变更留在 v1，破坏性变更走 /v2/，v1 至少保留一个大版本周期。",
    ].join("\n\n"),
  },
  servers: [{ url: "https://mykaoyan.cn", description: "本站在线环境" }],
  paths: {
    "/api/v1/progress": {
      get: {
        operationId: "getProgress",
        summary: "读取当前进度文件",
        description:
          "返回当前账号的进度文件与 ETag。网页会话与 Agent 令牌（Authorization: Bearer）都可以调用；ETag 用于 PUT 的 If-Match。",
        security,
        responses: {
          200: {
            description: "当前进度文件。",
            headers: { ETag: etagHeader },
            content: progressContent,
          },
          401: unauthorized,
        },
      },
      put: {
        operationId: "putProgress",
        summary: "整份替换进度文件",
        description: [
          "用请求体整份替换当前账号的进度文件，服务端只追加历史版本。",
          "必须带 If-Match：缺失返回 428，与当前 ETag 不匹配返回 412；成功后返回新的 ETag。",
          "网页会话与 Agent 令牌（Authorization: Bearer）都可以调用。",
        ].join("\n\n"),
        security,
        parameters: [
          {
            name: "If-Match",
            in: "header",
            required: true,
            description: "GET 返回的 ETag。缺失返回 428，不匹配返回 412。",
            schema: { type: "string" },
          },
        ],
        requestBody: { required: true, content: progressContent },
        responses: {
          200: {
            description: "替换成功；返回各类记录的新增、修改、删除条数。",
            headers: { ETag: etagHeader },
            content: changeSummaryContent,
          },
          400: { description: "请求体不符合进度文件 v1 JSON Schema。" },
          401: unauthorized,
          412: { description: "If-Match 与当前 ETag 不匹配。" },
          428: { description: "缺少 If-Match。" },
        },
      },
    },
  },
  components: {
    schemas: {
      ProgressFile: progressSchemaBody,
      ProgressChangeSummary: changeSummarySchemaBody,
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Agent 令牌，只能读写本人进度。",
      },
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description: "网页登录会话。",
      },
    },
  },
}

writeJson(resolve(root, "apps/web/public/schemas/progress/v1/progress.schema.json"), progressSchema)
writeJson(resolve(root, "apps/web/public/openapi.json"), openapi)
console.log("已生成公开契约产物：progress.schema.json、openapi.json")
