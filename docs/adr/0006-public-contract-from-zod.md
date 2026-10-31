---
status: accepted
---

# 公开契约由 zod 单一来源生成，进度文件整份替换

考生要用自己的 agent 和本站的 skill 生成进度文件再上传，外部工具只能依赖公开契约。因此进度文件格式和公开接口的数据结构只在 `packages/core` 的 zod 定义里写一次，由它生成 JSON Schema 2020-12（zod 4 的 `z.toJSONSchema()`）和 OpenAPI 3.1（生成脚本直接产出，不引入第二套装饰器定义），并用于 NestJS 的请求校验。进度文件上传是整份替换：`PUT` 必须带 `If-Match`，版本号不匹配返回 412；服务端只追加保存历史版本。细粒度写接口以后再加。

## Considered Options

- **`@nestjs/swagger` 装饰器另写一遍**：同一结构两份定义，必然漂移。
- **OpenAPI 3.2**：Rust 和 TypeScript 的代码生成工具对 3.1 支持更成熟。
- **兼容旧站进度文件**：旧站用 `format: "kaoyan-progress"` + `formatVersion: 1` 标识（不是 `app` 字段）；旧站没有外部用户，从 mykaoyan 的 v1 重新开始，识别字段为 `app: "mykaoyan"` + `version: 1`。

## Consequences

- 加字段、放宽约束是兼容变更，留在 v1；改名、删字段、收紧约束走 `/v2/`，v1 至少保留一个大版本周期。
- 生成的 schema 与 OpenAPI 文件进仓库，CI 检查「重新生成后没有差异」。
- Rust CLI 和 skill 只从公开契约生成类型或校验，不导入仓库内部代码。

> 2026-11-01：OpenAPI 版本已升级到 3.2.0（见 [ADR 0018](./0018-openapi-3.2.md)）；本文其余决定不变。
