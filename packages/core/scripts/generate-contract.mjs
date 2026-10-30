#!/usr/bin/env node
/**
 * 由 packages/core 的 zod 定义生成公开契约产物：
 * - apps/web/public/schemas/progress/v1/progress.schema.json
 * - skills/mykaoyan/references/progress.schema.json
 * - apps/web/public/openapi.json
 *
 * 产物提交进仓库；CI 重新生成后必须没有差异。
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { z } from "zod"

import {
  publishHandoutResultSchema,
  publishHandoutSchema,
  publishLessonSchema,
  publishPreparedSchema,
  publishResultSchema,
} from "../src/catalog/index"
import { publishPaperResultSchema, publishPaperSchema } from "../src/papers/index"
import { progressChangeSummarySchema } from "../src/progress/change-summary"
import { progressFileSchema } from "../src/progress/schema"

const SCHEMA_URL = "https://mykaoyan.cn/schemas/progress/v1/progress.schema.json"
const HANDOUT_SCHEMA_URL = "https://mykaoyan.cn/schemas/publish/v1/handout.schema.json"
const PAPER_SCHEMA_URL = "https://mykaoyan.cn/schemas/publish/v1/paper.schema.json"
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

const { $schema, ...progressSchemaBody } = z.toJSONSchema(progressFileSchema, { io: "input" })
const progressSchema = { $schema, $id: SCHEMA_URL, ...progressSchemaBody }
const { $schema: _handoutDialect, ...handoutSchemaBody } = z.toJSONSchema(publishHandoutSchema, { io: "input" })
const handoutSchema = { $schema: _handoutDialect, $id: HANDOUT_SCHEMA_URL, ...handoutSchemaBody }
const { $schema: _paperDialect, ...paperSchemaBody } = z.toJSONSchema(publishPaperSchema, { io: "input" })
const paperSchema = { $schema: _paperDialect, $id: PAPER_SCHEMA_URL, ...paperSchemaBody }
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
      `讲义发布 JSON Schema：${HANDOUT_SCHEMA_URL}`,
      `试卷发布 JSON Schema：${PAPER_SCHEMA_URL}`,
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

// 发布接口与 CLI 同样只依赖公开契约。
for (const [name, definition] of Object.entries({
  PublishLesson: publishLessonSchema,
  PublishPrepared: publishPreparedSchema,
  PublishResult: publishResultSchema,
  PublishHandout: publishHandoutSchema,
  PublishHandoutResult: publishHandoutResultSchema,
  PublishPaper: publishPaperSchema,
  PublishPaperResult: publishPaperResultSchema,
})) {
  const { $schema: _dialect, ...body } = z.toJSONSchema(definition, { io: "input" })
  openapi.components.schemas[name] = body
}
const publishSecurity = [{ bearerAuth: [] }]
const content = (name) => ({ "application/json": { schema: { $ref: `#/components/schemas/${name}` } } })
openapi.paths["/api/v1/publish/prepare"] = {
  post: {
    operationId: "preparePublish",
    summary: "管理员准备发布一讲；同哈希不上传",
    security: publishSecurity,
    requestBody: { required: true, content: content("PublishLesson") },
    responses: {
      201: { description: "发布计划，签名 URL 有效15分钟", content: content("PublishPrepared") },
      400: { description: "内容无效" },
      401: { description: "缺少管理员发布令牌" },
      403: { description: "令牌用途或账号角色没有发布权限" },
      409: { description: "对象不一致" },
      503: { description: "R2 未配置" },
    },
  },
}
openapi.paths["/api/v1/publish/{id}/complete"] = {
  post: {
    operationId: "completePublish",
    security: publishSecurity,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
    responses: {
      201: { description: "校验对象后登记并读回", content: content("PublishResult") },
      401: { description: "缺少管理员发布令牌" },
      403: { description: "令牌用途或账号角色没有发布权限" },
      404: { description: "计划不属于当前账号" },
      409: { description: "对象未就绪或发布冲突" },
    },
  },
}
openapi.paths["/api/v1/publish/lessons/{slug}"] = {
  get: {
    operationId: "getPublishedLesson",
    security: publishSecurity,
    parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
    responses: {
      200: { description: "发布登记读回", content: content("PublishResult") },
      401: { description: "缺少管理员发布令牌" },
      403: { description: "令牌用途或账号角色没有发布权限" },
      404: { description: "讲不存在" },
    },
  },
}

openapi.paths["/api/v1/publish/handouts/{slug}"] = {
  put: {
    operationId: "putHandout",
    summary: "管理员发布或更新一份讲义（Markdown）",
    description: [
      "一次请求写入讲义内容，用于速查表、自编题面等不带视频的 Markdown。",
      "内容与路径 slug 必须一致；内容相同返回 unchanged=true 且不写库。",
      "新讲义默认下架；更新不改变上架状态，上架走管理员上下架接口。",
      "只发布题面或自学材料，答案、解析与真题原文不得发布。",
    ].join("\n\n"),
    security: publishSecurity,
    parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
    requestBody: { required: true, content: content("PublishHandout") },
    responses: {
      200: {
        description: "发布结果；unchanged=true 表示内容未变化。",
        content: content("PublishHandoutResult"),
      },
      400: { description: "内容无效，或请求体 slug 与路径不一致。" },
      401: { description: "缺少管理员发布令牌" },
      403: { description: "令牌用途或账号角色没有发布权限" },
    },
  },
}

openapi.paths["/api/v1/publish/papers/{slug}"] = {
  put: {
    operationId: "putPaper",
    summary: "管理员发布或更新一套真题试卷（结构化题面与答案）",
    description: [
      "一次请求写入试卷元数据与全部题目；题目整体替换。",
      "内容与路径 slug 必须一致；内容相同返回 unchanged=true 且不写库。",
      "新试卷默认下架、version=1；内容变化时 version 递增；更新不改变上架状态。",
      "题号必须唯一且严格升序；选择题必须有选项，非选择题不得带选项。",
      "只发布站主确认取得授权的真题；答案与解析只经登录后的答案接口读取。",
    ].join("\n\n"),
    security: publishSecurity,
    parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
    requestBody: { required: true, content: content("PublishPaper") },
    responses: {
      200: { description: "发布结果；unchanged=true 表示内容未变化。", content: content("PublishPaperResult") },
      400: { description: "内容无效，或请求体 slug 与路径不一致。" },
      401: { description: "缺少管理员发布令牌" },
      403: { description: "令牌用途或账号角色没有发布权限" },
    },
  },
}

writeJson(resolve(root, "apps/web/public/schemas/progress/v1/progress.schema.json"), progressSchema)
writeJson(resolve(root, "apps/web/public/schemas/publish/v1/handout.schema.json"), handoutSchema)
writeJson(resolve(root, "apps/web/public/schemas/publish/v1/paper.schema.json"), paperSchema)
writeJson(resolve(root, "skills/mykaoyan/references/progress.schema.json"), progressSchema)
writeJson(resolve(root, "apps/web/public/openapi.json"), openapi)
writeJson(resolve(root, "cli/contracts/openapi.json"), openapi)
console.log("已生成公开契约产物：进度、讲义与试卷 JSON Schema、OpenAPI")
