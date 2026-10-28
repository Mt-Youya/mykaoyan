# M2 交接：公开契约、Agent 令牌、skill 与 Rust CLI

> 生成：2026-10-28。给下一个会话（Codex）的执行交接。开工前先读：`AGENTS.md`、`docs/PLAN.md` §4 与 §5.5、`docs/specs/0001-mykaoyan-v1.md`、`docs/adr/0006-public-contract-from-zod.md`，以及本目录 `issues/09`–`issues/14`。
>
> 本文只写「还剩什么、怎么验、被什么卡着」，不重复 PLAN 与工单原文。工单才是验收契约；本文补充现状、决策点和缺口。

## 1. 目标与验收

M2 的目的：把进度文件做成公开契约，让考生的 agent 和 Rust CLI 都能读写；让管理员能用 CLI 发布课程。

PLAN §4 的验收原文：

1. skill 在一个全新 agent 会话中按说明生成合法进度文件并上传成功；
2. CLI 从 SRC 的 `课程/` 幂等发布一章，重复发布无变化，且不改上架状态。

## 2. 当前基线（2026-10-28 收工时）

| 项 | 状态 |
| --- | --- |
| 契约（工单 09） | 本地完成：zod 定义、`apps/web/public/schemas/progress/v1/progress.schema.json`、`apps/web/public/openapi.json`、`/docs/contract`、fixture、CI 无差异。线上地址待部署 |
| 进度文件 API（工单 10 后端） | `apps/api/src/progress/`：`GET/PUT /api/v1/progress`、`GET /api/v1/progress/revisions` |
| 进度文件前端 | `apps/web/src/features/progress/use-progress.ts` 已供今日页/错题页使用；**没有** `/progress` 页面 |
| 主干提交 | `d3e1046`（媒体 Worker name 对齐 + pitfalls `mk/DEPLOY-01`）、`c7e71eb`（阿里云 skill 清单）、`4f9c28b`（方案 B 文档对齐） |
| 已部署 | `mykaoyan-web` 版本 `f245e9ce`（含 `/api` 反代）；媒体 Worker 线上名为 `mykaoyan` |
| 域名 | `mykaoyan.cn` 的 NS 仍在阿里云（hichina），**公网不可访问**；Cloudflare custom domain 已绑定就绪 |
| 外部环境 | Rust 1.98.1、Node 24、pnpm 已就绪；本机没有 `aliyun` CLI；`dash.cloudflare.com` 与 `raw.githubusercontent.com` 从本机不可达 |

基线验证命令（在本机应全绿）：

```bash
pnpm install --frozen-lockfile
pnpm fmt:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## 3. 任务（按建议顺序）

### 3.1 工单 10 收尾：进度文件网页

现状：后端与 hook 已有，缺页面，复选框未核销。

要做：

- 新增 `/progress` 路由（TanStack Router），功能：
  - 显示当前文档元数据（更新时间、各类记录条数）与 ETag
  - 下载整份进度文件（`GET /api/v1/progress`，保存 ETag）
  - 上传文件：本地解析 → zod 校验 → 展示变更摘要（`summarizeProgressChanges`）→ 确认 → `PUT` 带 `If-Match`
  - 412 冲突时提示「云端已被修改，请先重新下载」；428 提示缺少版本
  - 历史版本列表（`GET /api/v1/progress/revisions`），可查看摘要
- 复用 `use-progress`，不要另起一套请求逻辑
- 测试：合法/非法 JSON、冲突路径、成功后刷新、未登录 401
- 完成后勾选工单 10 的复选框

验收：登录后下载 → 改 → 上传 → 看到摘要 → 成功；制造并发冲突能看到 412 提示。

### 3.2 工单 11：Agent 令牌（M2 的安全边界）

默认方案（可推翻，推翻前先和站主确认）：**自建表 + Nest 中间件**，不用 Better Auth 的 apiKey 插件。

要做：

- 表 `agent_tokens`：`id`、`account_id`、`name`、`token_hash`（SHA-256）、`last4`、`created_at`、`last_used_at`、`revoked_at`；Drizzle migration + RLS 兜底
- 生成 32 字节随机值（base64url），**只显示一次**；库里只存哈希
- 认证：`Authorization: Bearer <token>` 且路径匹配 `/api/v1/*` 时查询哈希并绑定 account；吊销或不存在返回 401
- 令牌不能用于：`/api/auth/*`（建会话）、网页用的 `/api/progress`、管理员接口
- 会话接口：`POST /api/agent-tokens`（生成）、`GET`（列表，含最后使用时间）、`DELETE /:id`（吊销）
- 每次成功请求更新 `last_used_at`（先直写，节流以后再说）
- 测试：只能读写自己进度；不能建网页会话；吊销立即失效；读不到别人数据
- 错误统一 `application/problem+json`

验收：生成 → 只看到一次明文 → 用 curl 读写自己的进度成功 → 吊销后 401 → 列表里有最后使用时间。

### 3.3 工单 12：skill `mykaoyan`

要做：

- 目录 `skills/mykaoyan/`，按 agentskills.io 规范：`SKILL.md`、`validate.mjs`、`templates/progress.v1.json`
- `SKILL.md` 写：进度文件格式、字段含义、如何用 Agent 令牌上传（含 curl 示例、412/428/401 的处理）
- `validate.mjs`：零依赖 Node 脚本，对公开 schema 的关键约束做校验；结论必须与 `apps/web/public/schemas/progress/v1/progress.schema.json` 对同一组 fixture 一致
- 模板：一份空白合法进度文件
- 验收：新开一个 agent 会话，只给它 skill，让它生成合法文件并用令牌 PUT 成功；把过程记录到工单
- 约束：说明里不出现真实个人数据

### 3.4 工单 13：Rust CLI 进度命令

要做：

- 新建 `apps/cli` Cargo 工程（不进 pnpm workspace）
- 命令：`login`（交互输入 Agent 令牌）、`progress pull`、`progress validate`、`progress push`
- 令牌存系统配置目录（Windows `%APPDATA%`、macOS `~/Library/Application Support`），文件权限仅本人可读
- `push` 遵守 `If-Match`；412 时提示先拉取再推送
- 类型从 `apps/web/public/openapi.json` 生成（选一个 Rust 生成方案，把选择写进 ADR 或工单备注）
- 退出码、stderr、`--json` 输出遵循 Rust CLI Book
- 集成测试：对按 OpenAPI 回放的 mock 服务
- 验收：本地 API 上 login → pull → 改 → push → validate 全通

### 3.5 工单 14：CLI publish（最大，放最后）

**前置缺口（必须先补）**：API 现在没有发布接口，也没有 R2 写能力。现有 `admin` 只有 `GET /admin/content` 和两个上下架 `PUT`。

先补 API：

- 新增管理员发布接口：登记讲的内容（slug、标题、视频对象 key、字幕对象 key、讲稿 markdown、内容哈希）
- 上传方式：API 用 S3 SDK 生成 R2 预签名 PUT，浏览器/CLI 直传；需要新环境变量 `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`、`R2_ENDPOINT`（本地 `.env` 与 ECS `.env`，不进仓库）
- 幂等：内容哈希相同则 no-op，不产生新版本、不重复上传
- 替换：先传新对象 → 写库 → 成功后删旧对象
- 只写内容字段，不写上架状态（测试：先下架 → 发布 → 仍下架）
- 跳过答案类文件并报告
- 管理员令牌与普通 Agent 令牌分开，发布接口只认管理员

再接 CLI：`publish <章节目录>`，扫描约定布局、算哈希、申请预签名、上传、读回确认、打印摘要。

验收：SRC 的 `课程/` 里一章重复发布无变化；先下架再发布仍为下架；发布后库里每个对象 key 都在桶里。

**阻塞**：

- R2 S3 凭据本机没有。Cloudflare API Token 不是 S3 凭据，需要在控制台另建 R2 API Token（Access Key ID / Secret）；
- `课程/` 目录布局需要站主给一份样例（章节目录名、视频/字幕/讲稿文件名规则），代码里不猜；
- 媒体链路（真实 R2 播放）尚未验收。

## 4. 外部阻塞（不要在这上面空转）

| 阻塞 | 影响 | 处理 |
| --- | --- | --- |
| 备案未通过、NS 未切 | 线上地址不可访问，M2 生产验收做不了 | 本地 API + 真实 Postgres 验收；线上等站主切 NS |
| ECS API 未上线 | 没有 `api.mykaoyan.cn`，Worker 的 `/api` 反代会失败 | 同上 |
| R2 S3 凭据缺失 | 工单 14 无法真实上传 | 向站主申请 R2 API Token |
| 本机访问 `dash.cloudflare.com` 失败 | `cf`/`wrangler` OAuth 刷新不了 | 用 Cloudflare API Token：`~/.cloudflare/mykaoyan-token`（**不要打印内容**）；`api.cloudflare.com` 本机可达 |
| 本机没有 `aliyun` CLI | 阿里云相关 skill 不可用 | 需要时先装 CLI 与 RAM 子账号 AK |

## 5. 开工与交付约定

1. 先跑基线验证命令，确认全绿再动手；任何一项红先修，不要带着红基线开发。
2. 每个工单先写测试再实现；新增守卫做一次变异检查（改坏被测对象确认测试变红）。
3. 提交用 Conventional Commits，**commit 前先问站主**；push、部署、创建云资源都要本轮明确同意。
4. 报告时分「静态检查 / 构建 / 本地运行 / 浏览器实测 / 真机实测」写，跳过的写跳过。
5. 不改 `packages/ui/components/ui/*`；包特定依赖由包自己声明。

## 6. 红线（摘要，详见 `docs/PLAN.md` §2）

- 不读、不复刻 SRC 的 `.env*`、`tmp/`、`我的备考档案*`、`择校调研*`、`招生核验*`、`资料来源/真题答案/`；
- 不提交任何密钥、项目 ID、连接串、IP、真实个人数据；文档不写本机绝对路径；
- 真题原文、题图、答案、官方公告原件不进站点和仓库；
- 答案不出现在题面、索引、摘要、搜索、OG、sitemap 等任何可见载体。
