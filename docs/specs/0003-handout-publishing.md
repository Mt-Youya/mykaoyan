# 规划 0003：讲义（含题面）发布

状态：已实现（2026-10-30 本地验收通过；生产部署与首次生产发布待站主批准）。来源：课程发布只覆盖「讲」（视频+字幕+讲稿），站主要求也能上传试题；v1 红线不允许真题原文、真题答案与结构化题库，因此先新增讲义发布链路，用 Markdown 承载自编题面与速查表。

## 1. 现状与目标

现状：

- 讲的发布走 R2 两阶段（[ADR 0011](../adr/0011-cli-content-publishing.md)），契约在 zod → OpenAPI 里，但没有独立的发布 JSON Schema。
- `handouts` 表、`/api/handouts` 浏览页与管理员上下架已存在，但**没有发布链路**，所以速查表、题面目前都无法上站。
- 试题/试卷没有内容模型；规划 0002 里试卷公共索引仍是筹备。

目标：

1. 管理员用 CLI 把一份 Markdown 发布为讲义（速查表、自编题面）。
2. 重复发布同内容不产生变化；发布不改上架状态；新内容默认下架。
3. 契约仍以 zod 为单一来源，生成 OpenAPI 3.1 与**独立 JSON Schema**。
4. 不新增对象存储、不做结构化题库与做题判分。

非目标：答案/解析存储、真题原文、模拟卷整题、试卷索引与专题聚合页、做题与判分、题目拆分与考点标签（留后续规划）。

## 2. 术语与内容边界

- **讲义**：不带视频、单独发布的 Markdown（[GLOSSARY.md](../../GLOSSARY.md)）。题面按讲义发布，不新建一类内容。
- 只发布**题面/自学材料**。答案与解析、真题原文、真题答案、模拟卷整题一律不上站（[PLAN.md](../PLAN.md) §2）。
- 「专题训练」中标注 `真题改编 2022—2024` 的册默认不批量发布；站主逐册确认后，只挑自编题面发布，并保留【来源】标注，不复制真题原文。
- 「模拟卷」含 2022—2024 年真题原题，禁止发布。

## 3. 内容模型

复用 `handouts` 表，不新增迁移：

| 字段（契约） | 表字段 | 约束 |
| --- | --- | --- |
| `subjectCode` | `subject_code` | 三位数字，与考试科目代码一致 |
| `slug` | `slug` | 小写字母数字与连字符，复用 `packages/core` 的 slug 规则（已排除 `answer`/`answers`），全局唯一 |
| `title` | `title` | 1–200 字符 |
| `position` | `position` | 非负整数，同科目内排序 |
| `markdown` | `markdown` | 1–1,000,000 字符 UTF-8 |
| — | `listed` | 新内容 `false`；更新语句不写该字段 |

## 4. 契约

`packages/core` 新增（strictObject，沿用 [ADR 0006](../adr/0006-public-contract-from-zod.md)）：

- `publishHandoutSchema`：`subjectCode`、`slug`、`title`、`position`、`markdown`。
- `publishHandoutResultSchema`：`slug`、`unchanged`、`listed`、`contentHash`（64 位小写 hex）、`updatedAt`（ISO 8601）。
- `contentHash = sha256(subjectCode + "\0" + slug + "\0" + title + "\0" + position + "\0" + markdown)`，用于客户端判断内容是否变化；不入库、不对外当版本号。

生成物（`pnpm --filter @mykaoyan/core generate:contract`，CI 重新生成后必须无差异）：

- `apps/web/public/openapi.json` 与 `cli/contracts/openapi.json`：新增 `PUT /api/v1/publish/handouts/{slug}`，组件 `PublishHandout`、`PublishHandoutResult`。
- 新增 `apps/web/public/schemas/publish/v1/handout.schema.json`，`$id = https://mykaoyan.cn/schemas/publish/v1/handout.schema.json`，只描述请求体；OpenAPI 的 `info.description` 增加该链接。
- 现有进度文件 JSON Schema 不变。

## 5. 接口

`PUT /api/v1/publish/handouts/{slug}`

- 认证：`Authorization: Bearer <publish 令牌>`；每次查询账号当前角色与吊销状态（复用 `verifyPublisher`，普通进度令牌 403，非管理员 403，缺失/吊销 401）。
- 请求体：`PublishHandout`。`body.slug` 必须等于路径 `slug`，否则 400。
- 行为：单条 `insert ... on conflict (slug) do update` 完成写入；新建时 `listed=false`；更新只写内容字段与 `updated_at`，不写 `listed`。单语句天然并发安全，不引入计划表与基线冲突。
- 幂等：内容四字段与 `markdown` 全部相同 → `unchanged=true`，仍返回当前 `listed` 与 `contentHash`；不写库。
- 响应：200，body 为 `PublishHandoutResult`；错误沿用 `application/problem+json`（400/401/403）。
- 服务端 JSON 请求体上限 2 MB（`NestExpressApplication.useBodyParser` 覆盖 Nest 默认 100 kB），保证 1 MB Markdown 加 JSON 转义能进入契约校验。
- 上架：复用 `PUT /api/admin/handouts/{slug}/listing` 与 `listing_changes` 审计；本接口不改变上架状态。

## 6. CLI

```sh
mykaoyan publish-handout <file.md> --subject 408 --slug 408-ds-tree --title "数据结构 · 树与二叉树（题面）" [--position 1] [--dry-run] [--json]
```

- 读取 UTF-8；文件 ≤ 1 MiB；拒绝符号链接。
- 文件名或路径含 `答案`、`解析`、`answer`、`solution` 时直接失败，不读取内容（与讲发布的排除规则一致）。
- `--dry-run` 不联网，校验参数并输出 `slug`、字节数、`contentHash`。
- 认证、站点地址与退出码规则复用 `auth`：publish 令牌；仅本地回环允许 HTTP。
- `--json` 成功输出服务端结果单条 JSON；错误输出 stderr 单条 `{"error":"说明"}`。

## 7. 测试与验收

- core：schema 边界（slug、markdown 长度、答案类 slug 拒绝）与 `contentHash` 稳定性。
- 生成物：CI 重新生成后无差异；handout JSON Schema 的 `$id`、必填项与 `additionalProperties:false`。
- API：401/403/400；新建后 `listed=false`；重复发布 `unchanged=true`；先手动上架再发布仍为上架；内容修改后 `contentHash` 变化、`listed` 不变。
- CLI：mock 服务覆盖成功、`unchanged`、400/401/403；答案类文件拒绝不读内容；`--dry-run` 离线。
- 手工：本机 API + 临时库发布一篇自编题面，读回标题与 Markdown；生产首次发布需站主批准，默认下架。
- 交付前：`pnpm fmt && pnpm lint && pnpm typecheck && pnpm test && pnpm build`；`cargo fmt --check`、`cargo clippy -D warnings`、`cargo test`。

## 8. 实施顺序

1. core schema 与单测 → 2. 生成脚本与产物 → 3. API 服务/控制器与集成测试 → 4. Rust CLI 子命令与 mock 测试 → 5. 文档与 README 更新 → 6. 本机验收。

生产启用需要先部署包含本接口的 API 镜像；当前生产 API 未包含该改动。

## 9. 开放问题

- 是否给 `handouts` 加 `content_hash` 或版本历史：暂不，内容比较足够；需要审计时再迁移。
- 结构化题库（题目拆分、考点标签、答案私有存储、做题判分）：另立规划，须先解决真题与答案红线。

## 10. 验收记录（2026-10-30）

实现范围：`packages/core` 契约与生成脚本、`apps/api` 发布服务/控制器、Rust CLI `publish-handout`、接口与 mock 测试、CLI README 与规范文档。生产 API 镜像尚未包含本接口。

本机验证（Windows + 临时 Postgres 18.4，重放全部迁移；真实行尾与技能链接状态见下）：

- 契约生成：`pnpm --filter @mykaoyan/core generate:contract` 重复执行产物 SHA-256 一致；`PublishHandout` / `PublishHandoutResult` 与 handout JSON Schema 已生成，CLI 与网站 OpenAPI 完全一致（根测试 `tests/contract/cli.test.mjs` 通过）。
- API：`pnpm --filter @mykaoyan/api test` 全量 155 项中 153 通过；仅 `backup.test.mjs` 的 2 项因本机没有 `pg_dump` 失败（环境缺 PostgreSQL 客户端，与本次改动无关，CI 会安装客户端）。
- Rust CLI：`cargo fmt --check`、`cargo clippy --locked --all-targets -- -D warnings`、`cargo test --locked` 全部通过（含 5 项讲义 mock 测试）。
- 其余：`pnpm typecheck`、`pnpm build` 通过；`@mykaoyan/core` 156 项、`@mykaoyan/web`、`@mykaoyan/ui`、`@mykaoyan/media-worker` 30 项测试通过；根架构/契约测试 109 项中 3 项为 Windows 本机环境限制失败（行尾导致的技能占位文件非 junction、`rules.test.mjs` 的 Windows 路径分隔符断言），CI Linux 上由 `scripts/link-skills.mjs` 与 POSIX 路径满足。
- 本机限制：`pnpm fmt:check` 在全仓库 CRLF 工作区会报 350 个既有文件（[mk/TOOL-10](../pitfalls.md)），本次改动的文件已单独通过 oxfmt 检查；格式化结论以 CI Linux 为准。
- 端到端：真实 CLI（debug 二进制）→ 本机 API（端口 3102）→ 临时 Postgres 18.4 发布 `handout.md`，首次返回 `unchanged:false`、`listed:false`、`contentHash`，数据库行读回标题/Markdown/科目/顺序一致；第二次发布返回 `unchanged:true` 且 `updatedAt` 不变。
- 未做：生产部署、生产库讲义写入、浏览器/真机验收（域名未备案不可达）。生产首次发布需站主批准，默认下架。
