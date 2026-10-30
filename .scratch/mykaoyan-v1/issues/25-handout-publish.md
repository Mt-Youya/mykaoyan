# 25: CLI 讲义发布

**What to build:** 管理员用 CLI 把一份 Markdown（速查表、自编题面）发布为讲义；重复发布无变化；发布不改上架状态。

**Blocked by:** 08（管理员上下架）、13（Rust CLI）、14（发布令牌与契约模式）

**Status:** done（2026-10-30 本地实现并通过验收；生产部署与首次生产发布待站主批准）

- [x] core 新增 `publishHandoutSchema` / `publishHandoutResultSchema` 与单测（slug、markdown 长度、contentHash 稳定）
- [x] `generate-contract` 输出 OpenAPI 路径与组件、`apps/web/public/schemas/publish/v1/handout.schema.json`；重复生成 SHA-256 一致
- [x] API `PUT /api/v1/publish/handouts/{slug}`：publish 令牌 + 管理员；body 与路径 slug 一致；新建下架、更新不写上架；幂等 `unchanged`
- [x] API 测试：401/403/400、新建/更新、重复发布、先上架再发布仍上架、contentHash 变化
- [x] CLI `publish-handout <file.md> --subject --slug --title [--position] [--dry-run] [--json]`；答案/解析/answer/solution 文件拒绝且不读取
- [x] CLI mock 服务测试：成功、unchanged、400/401/403、dry-run 离线
- [x] 文档：`cli/README.md` 增加用法；spec 0003、ADR 0015 已落
- [x] 验收：本机 API + 临时库发布自编题面并读回；生产首次发布需站主批准，默认下架

**红线：** 只发题面；答案与解析、真题原文/答案、模拟卷整题不上站；专题训练「真题改编」册默认不批量发布，逐册由站主确认。

## 实现记录（2026-10-30）

- 契约：`packages/core/src/catalog/index.ts` 新增两个 schema；`generate-contract.mjs` 生成 OpenAPI 路径/组件与独立 JSON Schema；`cli/contracts/openapi.json` 同步，CLI 与网站契约一致（根测试 `tests/contract/cli.test.mjs`）。
- API：`PublishingService.publishHandout` 单条 upsert + 内容哈希幂等；`PublishingController` 新增 PUT；`createApp` 把 JSON 请求体上限调到 2 MB（Nest 默认 100 kB 会先拒绝 1 MB 题面，见 pitfalls mk/API-01）；`updated_at` 兼容 postgres.js 字符串返回值。
- CLI：新增 `cli/src/publish/handout.rs` 与 `publish-handout` 子命令；`api.rs` 新增 PUT；`contract.rs` 校验请求与结果；`build.rs` 生成 `PublishHandout`/`PublishHandoutResult` 类型。
- 测试：API `handout.test.ts` 4 项、CLI `handout_http.rs` 5 项、core schema 2 项；API 全量 155 项中 153 通过，仅 `backup.test.mjs` 2 项因本机缺 `pg_dump` 失败（环境限制，CI 会安装客户端）。
- 其余：`pnpm typecheck`、`pnpm build` 通过；`pnpm --filter @mykaoyan/api test` 见上；Rust fmt/clippy/test 全绿；本机 `fmt:check` 受 Windows CRLF 工作区影响（mk/TOOL-10），改动文件已单独通过 oxfmt 检查，以 CI Linux 结论为准。
- 端到端：真实 CLI → 本机 API（3102）→ 临时 Postgres，首次 `unchanged:false`/`listed:false`，数据库行字段一致；重复发布 `unchanged:true`、`updatedAt` 不变。
- 未做：生产部署、生产库讲义写入、浏览器/真机验收（域名未备案不可达）。首次生产发布仍需站主批准，默认下架。

**验收命令：**

```bash
pnpm fmt && pnpm lint && pnpm typecheck && pnpm test && pnpm build
cargo fmt --manifest-path cli/Cargo.toml --check
cargo clippy --manifest-path cli/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path cli/Cargo.toml --locked
```
