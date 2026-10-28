# 09: 公开契约 v1

**What to build:** 任何人都能在站点上找到进度文件的 JSON Schema 和接口文档，并按它们写工具；契约只有一个来源，不会和实现不一致。

**Blocked by:** 02（Hello 全链路上线）

**Status:** ready-for-human（本地完成；线上发布待部署）

- [x] 进度文件 v1 以旧 kaoyan `progress/v1` 为起点，`app` 为 `"mykaoyan"`，用 zod 定义
- [x] 由 zod 生成 JSON Schema 2020-12 与 OpenAPI 3.1，发布在站点固定地址，有一个文档页
- [x] 有效与无效的虚构 fixture 各一组，用独立校验器验证结论与 zod 一致
- [x] CI 重新生成契约产物后与提交版本无差异
- [x] 版本规则（兼容变更留在 v1，破坏性变更走 v2）写在文档页

## 本轮交付说明

定义：`packages/core/src/progress/`（schema.ts + change-summary.ts），识别字段按 PLAN §5.5 为 `app: "mykaoyan"` + `version: 1`（旧站代码实际是 `format`/`formatVersion`，ADR 0006 已更正）。
生成：`packages/core/scripts/generate-contract.mjs` → `apps/web/public/schemas/progress/v1/progress.schema.json` 与 `apps/web/public/openapi.json`（含 GET/PUT `/api/v1/progress`、`If-Match` 412/428、`ProgressChangeSummary`、bearerAuth 与 sessionCookie 两种 securityScheme）。连续两次生成 sha256 一致。
校验器：`tests/contract/fixtures.test.mjs` 用 ajv 2020 独立校验 2 有效 + 18 无效 fixture，结论与 zod 完全一致（25 个测试）。
文档页：`apps/web/src/routes/docs/contract.tsx`（`/docs/contract`），本地构建后实测契约文件与页面均 200。
异常：线上地址仍依赖部署；语义规则（主键唯一、`weekStart` 周一、阶段不重叠）不在 JSON Schema 里，留给服务层。
