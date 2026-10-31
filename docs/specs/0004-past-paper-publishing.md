# 规划 0004：真题试卷发布（结构化题面与会员可见答案）

状态：已实现（2026-10-31 本机验收通过；生产迁移与首次真题发布待站主批准）。站主 2026-10-30 决定上线真题原文与答案，授权后续自行取得；红线变更见 [ADR 0016](../adr/0016-past-paper-publishing.md)。来源：站主要求把真题按原文与答案发布到站点，并选择「逐题结构化 + 登录/会员可见答案 + 单独查看答案页」。

## 1. 目标

1. 管理员用 CLI 发布一套结构化试卷：科目、年份、来源说明、逐题题面/选项/答案/解析/考点。
2. 访客可浏览已上架的试卷题面与来源；答案与解析只在会员或试卷上传者本人的独立答案页可见。
3. 发布幂等、默认下架；上架复用管理员上下架与审计。
4. 答案隔离贯穿数据、接口与页面：公开接口和页面不返回答案字段，搜素/OG/sitemap 不含答案。

非目标：原卷 PDF/图片上传、题目自动解析（从原始 Markdown 拆题）、做题判分、错题自动关联、真题来源授权管理。

## 2. 术语

- **试卷**：按科目与年份整理的一整套试题，见 [GLOSSARY.md](../../GLOSSARY.md)。
- **题**：试卷中的一道题，含题号、题型、分值、题面、选项（选择题）、答案、解析与考点标签。
- 题面公开；答案属于会员或试卷上传者本人的内容。

## 3. 数据模型

新增迁移（`packages/db/supabase/migrations`）：

`papers`：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | uuid | 主键，`gen_random_uuid()` |
| `subject_code` | text | 三位考试科目代码 |
| `year` | integer | 2000—2100 |
| `slug` | text | 唯一，复用 catalog slug 规则 |
| `title` | text | 1–200 字符 |
| `source_note` | text | 可空，来源说明；不得放原文 |
| `position` | integer | 非负；同科目排序 |
| `listed` | boolean | 默认 `false`；发布不改变 |
| `owner_account_id` | uuid | 可空，外键 → `accounts(id)`，`ON DELETE set null`；发布者账号，用于「本人可看自己试卷答案」 |
| `content_hash` | text | 可空；发布时写入 |
| `content_version` | integer | 默认 `0`；内容变化 +1 |
| `created_at` / `updated_at` | timestamptz | 默认 `now()` |

`paper_questions`：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `paper_id` | uuid | 外键 → `papers(id)`，`ON DELETE cascade` |
| `number` | integer | 1–999；`unique(paper_id, number)` |
| `type` | text | 单选/多选/填空/判断/简答/计算/算法/综合 |
| `score` | integer | 可空，0–100 |
| `topics` | text[] | 可空，考点标签 |
| `stem_markdown` | text | 题面 Markdown |
| `options` | jsonb | 可空，`[{label, markdown}]`，选择题用 |
| `answer_markdown` | text | 答案 Markdown |
| `analysis_markdown` | text | 可空，解析 Markdown |

两张表启用 RLS，`anon`/`authenticated` 无直接表权限（与现有表一致）；只经 API 服务层访问。

## 4. 契约（zod 单一来源）

`packages/core` 新增：

- `publishPaperSchema`：`subjectCode`、`year`、`slug`、`title`、`sourceNote`（可空）、`position`、`questions`（1–100 题）。
- `paperQuestionSchema`：`number`、`type`（枚举）、`score`（可空）、`topics`（数组，可空）、`stemMarkdown`、`options`（`{label ∈ A–H, markdown}` 数组，2–8 项，可空）、`answerMarkdown`、`analysisMarkdown`（可空）。题号在同一试卷内唯一、升序由服务端校验。
- `publishPaperResultSchema`：`slug`、`unchanged`、`version`、`listed`、`contentHash`、`questionCount`。
- `contentHash = sha256(JSON.stringify(规范化后的发布输入))`；规范化键序固定，服务端与 CLI 一致。

生成物：OpenAPI 新增 `PUT /api/v1/publish/papers/{slug}` 与组件；新增 `apps/web/public/schemas/publish/v1/paper.schema.json`（`$id = https://mykaoyan.cn/schemas/publish/v1/paper.schema.json`）；CLI 契约同步。CI 重新生成后无差异。

## 5. 接口

发布（管理员）：

- `PUT /api/v1/publish/papers/{slug}`：publish 令牌 + 管理员；body 必须与路径 slug 一致；事务内 upsert 试卷与全部题目；内容相同返回 `unchanged=true` 不写库；新试卷 `listed=false`、`content_version=1`；更新只写内容字段并 `content_version+1`，不写上架状态；题目整体替换。

公开（访客）：

- `GET /api/papers?subject=302`：已上架试卷列表（title、year、slug、sourceNote、questionCount），按 `year` 降序、`position` 升序。
- `GET /api/papers/{slug}`：已上架试卷元数据与题目**题面**（number、type、score、topics、stemMarkdown、options），**不包含** answer/analysis 字段。
- `GET /api/papers/{slug}/answers`：需要登录会话；有效会员、管理员或该试卷上传者本人可看，其他账号返回 403。未登录/会话失效返回 401；试卷未上架返回 404。返回同一试卷的题目答案与解析，响应 `Cache-Control: no-store`。
- 所有公开响应不缓存答案；答案接口 `Cache-Control: no-store`。

管理：`listing_changes.target_type` 增加 `paper`；管理员上下架支持试卷并写审计。

## 6. CLI

```sh
mykaoyan publish-paper paper.json --dry-run
mykaoyan publish-paper paper.json
```

- `paper.json` 为 `PublishPaper` 结构的单文件 JSON，包含试卷元数据与题目数组（题目题面/答案/解析均为 Markdown 字符串）。
- `--dry-run` 离线校验契约与题号唯一/升序，输出 `{dryRun,slug,questions,bytes,contentHash}`。
- 成功输出 `PublishPaperResult`；需要 `scope=publish` 管理员令牌；站点与认证规则复用 `auth`。
- 真题内容由站主在仓库外整理为 JSON 后发布，**不进仓库**；未取得授权前不导入生产。
- v1 不提供从原始 Markdown/PDF 自动拆题；后续可加导入工具（另立规划）。

## 7. 页面

- `/exams`：公开试卷列表（科目筛选、年份、题数、来源说明）。
- `/exams/{slug}`：公开题面页；逐题显示题号、题型、分值、考点、题面与选项；题目页不含答案；底部按钮「查看答案与解析」→ 会员或上传者进入 `/exams/{slug}/answers`，未登录先登录，非会员显示会员入口。
- `/exams/{slug}/answers`：会员或上传者答案页；逐题显示答案与解析；未登录显示登录入口，非会员显示会员入口；答案页加 `noindex`。
- 现有 `/papers` 浏览器本地试卷工作台保持不动；新真题页与本地导入互不依赖。
- 导航增加「真题」入口（与课程、讲义并列）。

## 8. 答案隔离与合规

- 答案只存在数据库与会员/上传者可见的答案接口/页面；公开接口不返回答案字段。
- 试卷列表、题面页的 meta、OG、sitemap、站内搜索都不含答案或解析。
- 来源说明（`sourceNote`）必须如实填写；未授权内容不得发布。
- 答案页按「有效会员或试卷上传者本人可看」；管理员可直接查看。以后如需更严格的会员策略，在答案服务里调整校验，题面不变。

## 9. 测试与验收

- core：契约边界（题号唯一/升序、选项 label、空答案拒绝、长度限制、contentHash 稳定）。
- 迁移：新表 RLS、`anon`/`authenticated` 无表权限；外键级联删除。
- API：401/403/400；新建默认下架、版本 1；重复发布 `unchanged`；内容修改版本 +1 且保持上架；公开列表/详情只含已上架且不含答案字段；答案接口未登录 401、非会员 403、会员 200、上传者本人 200、未上架 404；管理员上下架试卷写审计。
- CLI：mock 服务成功/unchanged/400/401/403；dry-run 离线；契约生成无差异。
- 端到端：本机 API + 临时库发布一套虚构试卷，公开详情不含答案，会员或上传者本人可读取答案。
- 交付前：`pnpm fmt && pnpm lint && pnpm typecheck && pnpm test && pnpm build`；Rust fmt/clippy/test。
- 生产：迁移与首次真题发布需站主批准；内容授权由站主负责。

## 10. 实施顺序

1. 迁移与 drizzle schema → 2. core 契约与生成物 → 3. 发布 API 与测试 → 4. 公开/答案 API 与登录保护测试 → 5. CLI 与 mock 测试 → 6. 页面与导航 → 7. 管理员上下架与文档 → 8. 本机端到端验收。

## 11. 开放问题

- 从原始题面 Markdown 自动拆题：v1 不做，先要求结构化 JSON；需要时按 [ADR 0016](../adr/0016-past-paper-publishing.md) 的授权边界另立规划。
- 会员可见强度：当前按「有效会员或上传者本人」；会员期由管理员手动开通或兑换码开通，与评论共用同一套会员期。
- 原卷 PDF/图片：不进入 v1；如需原卷版式，需单独授权与文件存储方案。

## 12. 验收记录（2026-10-31，本机）

- core 159 项测试通过；API 全量 162 项中 160 项通过（2 项 `backup.test.mjs` 因本机缺少 `pg_dump` 失败，CI 安装客户端）；web 25 文件 88 项通过；CLI `cargo test` 全部通过（含 5 项试卷 mock 测试）。
- `pnpm typecheck`、`pnpm build`、`cargo fmt --check`、`cargo clippy --locked --all-targets -- -D warnings` 通过；契约重复生成哈希一致，网站与 CLI OpenAPI 一致。
- 端到端：真实 CLI（debug 二进制）→ 本机 API（3103）→ 临时 Postgres 发布 `e2e-paper-fictional`（2 题）：首次 `version=1`、`listed=false`、`unchanged=false`，二次 `unchanged=true`；CLI dry-run 哈希与服务器返回一致；公开列表与详情含题面、不含 `answerMarkdown`/`analysisMarkdown`；答案接口未登录 401，集成测试覆盖非会员 403、会员 200 且 `Cache-Control: no-store`、试卷上传者本人 200。
- 未做：生产迁移、生产真题写入、浏览器/真机实测（域名未备案不可达）。首次生产发布需站主批准，默认下架；未授权内容不发布。
- 本机限制：`pnpm fmt:check` 在 Windows CRLF 工作区仍会报既有文件行尾问题（见 pitfalls mk/TOOL-10），本次改动的文件已单独通过 oxfmt 检查；格式化结论以 CI Linux 为准。
- 生产（2026-10-31）：站主批准公开发布并确认已获授权后，手工在生产 Supabase 应用 `papers`/`paper_questions`（含 `owner_account_id`）与 `submission_comments` 迁移；用生产库的本地 API + CLI 发布数学二 2007–2026（20 套）与 408 2022–2026（5 套）共 25 套、690 道题，全部 `listed=true` 并写入 25 条 `listing_changes` 审计；读回确认无空答案、公开列表 20+5 套、题面详情不含答案字段、未登录答案接口 401。
- 生产部署（2026-10-31）：部署 workflow 改为 runner 构建镜像 + SSH `docker save/load`（不再依赖 ACR 镜像仓库，也不再需要 `DEPLOY_KNOWN_HOSTS`），`手动部署` run `41178001262` 成功；ECS 上 web/api/caddy 三容器运行，API 健康检查 200 `{"status":"ok","database":"connected"}`。生产只读验收：`/api/papers?subject=302` 20 套、`subject=408` 5 套、详情不含答案字段、未登录答案 401、试卷评论公开可读；`/exams`、`/community/papers`、`/community/papers/new` 页面均 200。
- 剩余外部条件：ECS 上短信凭据仍是占位值（站主需填入阿里云真实 AccessKey/签名/模板并重启容器）后手机登录才可用；`mykaoyan.cn`/`api.mykaoyan.cn` 暂无 A 记录（备案中），Caddy 证书待 DNS 生效后自动签发。
