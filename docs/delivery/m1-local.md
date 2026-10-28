# M1 本地交付报告

> 状态更新（2026-10-28）：改动已提交并推送，CI 通过；前端部署按 [ADR 0010](../adr/0010-worker-api-proxy.md) 改为方案 B，线上 Worker 仍是 M0 Hello 版本。详见 [m0-local.md](./m0-local.md) 的状态更新。

日期：2026-10-27。范围：工单 05–09 的本地实现与验证。

云端环境仍未准备：**M1 未正式验收**。本报告只记录本地可复现的证据；短信外呼、真机、真实视频、线上契约地址等外部项一律标为缺口，不以本地替身代替。

## 已实现的本地部分

| 工单 | 实现 | 外部验收缺口 |
| --- | --- | --- |
| 05 | Better Auth 1.7.14 由 `AuthController` 直接挂 `auth.handler`；阿里云号码认证 `SendSmsVerifyCode`/`CheckSmsVerifyCode` 的 HMAC-SHA1 RPC 实现与内存替身；60 秒冷却 + 24 小时 10 条上限；出境同意单独勾选与落库；退出当前设备 / 全部设备；`SessionGuard` 401；手机号 HMAC 限流与日志脱敏；PIPIA 草案 | 真实 AK/SK 与模板、真机收码、浏览器 SSR 会话刷新端到端 |
| 06 | `courses`/`chapters`/`lessons`/`handouts` 表与迁移（`listed` 与内容字段分列）；`/api/courses`、`/courses/:slug`、`/lessons/:slug`、`/handouts`、`/handouts/:slug`；上架链任一级下架即 404；页面用 react-markdown + remark-gfm + remark-math + rehype-katex | 真机、Safari/Firefox、读屏；SSR 首屏只有加载态 |
| 07 | `POST /api/lessons/:slug/playback-token` 签发 HMAC 令牌（视频与字幕各一条）；播放器到期前 60 秒续签并恢复播放位置，失败按 1/2/4 秒退避，换讲时清空源 | 真实 R2 视频、字幕文件、长时间播放与拖动实测 |
| 08 | `accounts.role`；`PUT /api/admin/lessons/:slug/listing`、`/handouts/:slug/listing`；`GET /api/admin/content`；`listing_changes` 审计（同事务）；`/admin/content` 页面 | 真机与站主验收；管理员授予暂无界面 |
| 09 | 进度文件 v1 zod 定义与 `ProgressChangeSummary`；生成 JSON Schema 2020-12 与 OpenAPI 3.1；`/docs/contract` 文档页；ajv 2020 独立校验 20 个 fixture；CI 重新生成后无差异检查 | 线上地址待部署 |

## 验证分层

- **静态检查**：`pnpm fmt:check`、`pnpm lint`（0 error，25 个既有 warning）通过；`pnpm typecheck` 全仓库通过。
- **构建**：core、db、NestJS、TanStack Start/Nitro、媒体 Worker dry-run 全部通过。Docker 仍不可用，未构建镜像。
- **测试**：`pnpm test` 通过，共 **417** 项 —— media-worker 30、web 10、core 57、db 3、api 88、仓库守卫与冒烟 229（架构 201 + 契约 25 + 冒烟 3）。架构守卫覆盖根依赖、按包声明依赖、跨领域入口导入、500 行上限、core 只依赖 zod。
- **集成测试（真实 Postgres）**：`apps/api/src/auth.test.ts`（7）走 Drizzle adapter 与 migrate 后的真实表；`apps/api/src/admin.test.ts`（6）验证 401/403/管理员成功、审计记录、下架后公开接口与课程详情同步消失；`apps/api/src/catalog.test.ts`（7）与 `playback.test.ts`（8）覆盖上架链、令牌可被媒体 Worker 算法独立验签。本机用独立临时库重放三条迁移后运行，未触碰任何持久数据。
- **浏览器实测**：工单 06 用 Chromium 在 375×812 与 1280×900 下检查 26 项全过；5 个页面 `scrollWidth` 均为 375，无横向滚动；讲稿与讲义的 KaTeX、GFM 表格/任务列表/删除线、章与讲顺序、4 个未上架 URL 不泄露内容均已实测。截图见交付时的 `/tmp/catalog-shots/`（临时目录，不提交）。
- **契约确定性**：连续两次生成 `progress.schema.json` 与 `openapi.json` 的 sha256 一致。
- **真机实测**：跳过。短信、视频、Safari/Firefox、读屏均无结果。

## 与 M0 的差异

- 根依赖回到全仓库工具集；`vite`/`@vitejs/plugin-react`/`wrangler` 下沉到实际使用的包。
- `packages/ui` 整合入仓库：内部自引用改为相对路径、跨目录只走 `index`、拆分 676 行的 `sidebar`，补齐 `typecheck`/`test`/`build` 脚本。
- 架构守卫两处修正：`packages/core` 的 IO 约束只针对 `src/`（`scripts/` 是构建工具）；`src/` 根级文件（`config`、`environment`、`database`）不算领域，领域之间仍要求落到 `index`。
- 新增 `docs/privacy/pipia-phone-transfer.md`（草案，待站主确认）。

## 配置与操作边界

| 位置 | 变量 | 说明 |
| --- | --- | --- |
| API 运行时 | `MEDIA_SIGNING_KEY` | 必填，至少 32 字符；与媒体 Worker 的 `MEDIA_SIGNING_KEY` 必须是同一份 |
| API 运行时 | `MEDIA_BASE_URL` | 可选，默认 `https://media.mykaoyan.cn` |
| API 运行时 | `BETTER_AUTH_SECRET` | 必填，至少 32 字符；生产缺失则启动失败 |
| API 运行时 | `BETTER_AUTH_URL`、`ALIYUN_ACCESS_KEY_ID`、`ALIYUN_ACCESS_KEY_SECRET`、`ALIYUN_SMS_SIGN_NAME`、`ALIYUN_SMS_TEMPLATE_CODE` | 生产必填；`NODE_ENV=test` 强制内存短信实现 |
| Web 运行时 | `API_ORIGIN` | 可选；SSR 调 API 用，未配置时按请求 origin 推。部署时 `/api` 由 Caddy 反代 |
| Web 打包 | `NODE_ENV`、`HOST`、`PORT` | 与 M0 相同 |

- 管理员角色目前只能通过数据库迁移或 SQL 授予，没有自助接口。
- 阿里云短信模板的变量名必须与控制台的模板一致（默认 `{"code":"##code##","min":"5"}`）；联调前需要一次真实发码验证。

## 未完成项

- 工单 05：真实短信外呼与真机收码；浏览器 SSR 会话刷新的端到端（Better Auth 实例与 Nest 层的 `Set-Cookie` 透传已测）；真机会话过期后刷新。
- 工单 06：真机、Safari/Firefox、读屏；SSR 首屏没有课程内容（SEO 需改服务端取数）。
- 工单 07：真实 R2 视频、字幕、长时间播放与拖动。
- 工单 08：站主验收；管理员授予无界面。
- 工单 09：线上地址待部署。
- 评论、投稿、评分、学习追踪（工单 10–24）未开始。
