---
status: accepted
---

# 公开契约升级到 OpenAPI 3.2.0

ADR 0006 选择了 OpenAPI 3.1，当时的原因是 Rust/TypeScript 代码生成工具对 3.1 支持更成熟，并在考虑项里明确搁置了 3.2。现在公开契约需要跟随 OAS 3.2 的版本标识：OAS 3.2 与 3.1 完全向后兼容，官方升级指南的迁移方式只是把 `openapi` 字段改成 `3.2.0`，再按 3.2 工具校验；契约的数据结构、接口路径和 JSON Schema 2020-12 方言都不变。

## Decision

- `packages/core/scripts/generate-contract.mjs` 生成 `openapi: "3.2.0"`，显式保留 `jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema"`。
- 重新生成 `apps/web/public/openapi.json` 与 `cli/contracts/openapi.json`；本仓库的 zod 单一来源、进度文件 JSON Schema、讲义/试卷 JSON Schema 都不变。
- 不引入 3.2 新特性（层级 tag、QUERY 方法、`$self`、流式媒体类型等）；这些按需另开 ADR。
- Rust CLI 只读取 `components/schemas`，不受 OpenAPI 版本字段影响；`build.rs` 与类型生成保持不变。

## Consequences

- 公开契约的版本标识从 3.1 变为 3.2；使用 OAS 3.2 工具的消费方可以直接解析。仍使用 3.1 工具的消费方需要升级工具，或容忍 `openapi` 字段的版本差异。
- 文档页、skill、CLI README 与契约测试中的版本文案同步为 3.2.0；历史 ADR 与规格记录保持原样，本 ADR 作为版本升级的现行决定。
- 生成器改动为一行；CI 的「重新生成后无差异」检查继续覆盖。
- 已用 OpenAPI 3.2 官方 JSON Schema 对生成产物做结构校验（0 错误），并运行契约测试与 CLI 构建/测试。

## Validation

- OAS 3.2 schema：`https://spec.openapis.org/oas/3.2/schema/2025-09-17`
- 生成产物：`openapi: "3.2.0"`，`jsonSchemaDialect` 仍为 JSON Schema 2020-12；校验通过。
- 参考：[OpenAPI 3.1 到 3.2 升级指南](https://learn.openapis.org/upgrading/v3.1-to-v3.2.html)
