# M0 本地交付报告

## 后续部署更新（2026-10-27）

备案等待期间，前端已按 [ADR 0008](../adr/0008-temporary-web-worker.md) 发布到独立 `mykaoyan-web` Worker，并绑定 `https://mykaoyan.cn`。控制台读回部署就绪、流量 100%；HTTPS 首页与浏览器均显示当前 M0 Hello 页面，浏览器未见控制台错误。JS、CSS 返回 200，不存在的页面返回 404；`/api/health` 探测超时，未验收通过。媒体域名仍指向原 `mykaoyan` Worker，邮件 TXT 记录保留；本次未调整 `www`。

当前检查更新：全仓库格式、lint、类型检查及 105 个测试通过；Node 与 Workers 两个构建通过，Node 生产入口本地 HTTP 检查通过。前端产物确认不含媒体签名密钥。改动未提交、未 push；API 尚未上线，真机、国内三地和真实视频验收仍未执行。以下是初次本地交付时的记录，其中云端状态与测试数量以本节更新为准。

日期：2026-10-27。范围：工单 01–04 的本地代码、配置与验证。云端环境尚未准备，**M0 尚未正式验收，24 张工单尚未全部实现**；05–24 未开始，仍保留各工单的依赖关系。

## 已实现的本地部分

| 工单 | 实现 | 外部验收缺口 |
| --- | --- | --- |
| 01 | pnpm workspace；按包声明依赖；上海日期 LocalDate；聚合检查；架构守卫；CI 与密钥扫描配置；MIT 与内容权利说明 | GitHub Actions 尚未触发；未向远端提交假密钥做 CI 变异检查 |
| 02 | TanStack Start/Nitro 与 NestJS Node 服务；启动配置三态校验；真实 SQL 健康检查；Dockerfile、Caddy、compose、手动部署工作流与冒烟脚本 | Docker 镜像未实际构建；ACR/ECS、Supabase dev、TLS 与国内三地测速未验收 |
| 03 | Drizzle 生成 SQL；临时空库重放；RLS 与函数权限断言；dev → prod 手动迁移工作流；一致性快照备份、读回校验、恢复演练；每日备份/保活与每月恢复工作流；30 天保留规则文件 | dev/prod 迁移、真实 R2 上传、生命周期规则应用、生产恢复和保活未执行 |
| 04 | HMAC 播放令牌验证；单区间 Range、416、条件请求；精确 CORS；禁止缓存；本地 workerd 与 R2 模拟运行时验证 | 真实 R2 返回形状校准、Custom Domain、真实视频 5 分钟播放与拖动、国内三地测速未执行 |

根工具链经站主确认保留 TypeScript 7、tsx 与 Node 类型；业务包仍分别声明依赖。已验证 Node 24.22.1、pnpm 12.15.0、TypeScript 7.0.2、TanStack Start 1.169.4、Router 1.170.46、NestJS 12.2.0、Drizzle ORM 0.45.4、Vite 8.3.5 与 Nitro 3.0.260903-beta。精确依赖解析以锁文件为准。

## 验证分层

- **静态检查**：本轮源代码与配置格式、lint、所有包 typecheck、`git diff --check` 通过；工作流通过 YAML 解析与 actionlint 1.7.12。全仓库 `pnpm fmt` 与 `pnpm fmt:check` 通过；全仓库 `pnpm lint` 仍受外部新增的 `films/` 未使用变量影响而失败，不能以本轮定向 lint 代替全仓库通过。
- **构建**：core、db、NestJS、TanStack Start/Nitro 与媒体 Worker dry-run 通过。dry-run 没有上传 Worker。Docker 不可用，因此未执行镜像构建或 compose 启动。
- **本地运行**：NestJS 构建产物实际查询独立临时 Postgres 并返回健康；前端构建产物实际返回中文 HTML；原生 Caddy 2.11.7 的本机 HTTP 路径分发与冒烟脚本通过。生产 TLS 未验证。
- **浏览器实测**：Hello 验证页在 375px、1280px、1440px、1920px 宽度渲染；`hallmark sloplint --render` 为 0 FAIL、0 REFLEX、0 WARN。正式内容页尚未设计。
- **真机实测**：跳过。国内真实网络、短信、视频与三地晚高峰均没有验收结果。
- **测试**：包含 core 日期、HTTP 健康检查、启动配置、空库迁移与权限、备份恢复、媒体请求、workerd、本轮架构与冒烟脚本。最终 **104 个测试通过**（API 16、Worker 30、Web 4、core 16、db 3、仓库守卫与冒烟 35）；不得把外部验收记为测试通过。
- **变异检查**：错误时区、core 引入 Node 模块、误授 PUBLIC 函数执行权、绕过 HMAC 验签、假密钥均被拒绝；新增 If-Range 与缺失角色 ACL 用例先变红，再修复通过。
- **密钥扫描**：已用 Gitleaks 8.30.0 检查历史与本轮文件，扫描器拒绝合成假密钥。假密钥未写入仓库、未提交；GitHub CI 红灯尚未实测。

本机备份/恢复往返用真实 `pg_dump`、`pg_restore` 与 R2 CLI 替身，完整用例耗时约 **761ms**：`public.backup_probe` 2 行、`supabase_migrations.backup_probe` 1 行一致，且 `service_role` 的 SELECT 权限恢复后可用；损坏备份、非空目标与错误对象读回均被拒绝。这不是生产恢复或真实 R2 验收。

## Standards（规范审查）

最终独立只读审查发现 0 项新增确定问题；复核了 Web 启动校验、Docker 打包路径、临时测试库保护，以及角色与 schema ACL 恢复。审查代理未执行测试或构建。

## Spec（规格审查）

最终独立只读审查发现 1 项工单状态问题：工单 03 的 dev/prod 迁移核对被过早勾选。已取消勾选并明确“流程已实现，实际核对待环境”。备份恢复、媒体请求及新启动入口未发现新增确定问题。静态审查不能替代真实云端与真机验收。

两轴结果：规范 0 项；规格 1 项交付状态问题，已修正。

## 配置与操作边界

所有实际值只放进受忽略的本机配置或 GitHub Secrets，不写进本报告、工单、镜像或仓库。不要向聊天发送凭据。

| 位置 | 变量 | 用途 |
| --- | --- | --- |
| API 运行时 | `NODE_ENV`、`PORT`、`DATABASE_URL`，可选 `DATABASE_CA` | 开发/生产使用 Supavisor transaction 端口 6543、`sslmode=verify-full`、`prepare: false`；可选 CA 不接受空串 |
| Web 运行时 | `NODE_ENV`、`HOST`、`PORT` | 启动时用 zod 校验后加载 Nitro 产物；前端不持有数据库连接 |
| Worker Secret | `MEDIA_SIGNING_KEY` | 至少 32 字符；未来 API 签发与 Worker 验签使用同一份密钥，当前 API 签发属于工单 07 |
| GitHub production | `ACR_REGISTRY`、`ACR_NAMESPACE`（Variables）；`ACR_USERNAME`、`ACR_PASSWORD`、`DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`、`DEPLOY_KNOWN_HOSTS`（Secrets） | 手动部署；ECS 预先准备 Docker、ACR 拉取权限、应用目录及私有运行时 `.env`；镜像引用单独写入 `.env.images` |
| GitHub database-dev / database-prod | `MIGRATION_DATABASE_URL`（Secret） | 先空库测试，再核对 migration list、推 dev、核对、推 prod、核对；生产环境应设置审批规则 |
| GitHub backup-production | `BACKUP_DATABASE_URL`、`DATABASE_CA`、`R2_ENDPOINT`、`BACKUP_BUCKET`、`BACKUP_ACCESS_KEY_ID`、`BACKUP_SECRET_ACCESS_KEY`（Secrets） | 会话连接端口 5432；备份端 pg_dump 不低于源库主版本；R2 凭据限定在私有备份桶 |
| 本地恢复演练 | `RESTORE_DATABASE_URL`、`BACKUP_OBJECT_KEY`，以及备份存储变量 | 仅允许本机 `mykaoyan_restore_test` 空库；校验 SHA-256 后恢复；缺失角色以无登录、无全局特权的占位角色建立，以解析 ACL |
| GitHub 仓库 Variable | `OPERATIONS_ENABLED=true` | 默认未启用；确认资源、备份桶私有性与保留规则后再开启每日运维。定时备份所在环境不能配置每次都需人工批准的规则 |

每日运维时间为北京时间 02:20，恢复演练在每月 2 日北京时间 02:20 的定时运行及手动触发时执行。失败会使工作流失败。部署冒烟失败目前不自动回滚镜像，应按已知镜像引用恢复并重新验证。

备份覆盖 `public` 业务 schema 与存在时的 `supabase_migrations`，保留 ACL、RLS、同一快照中的逐表行数与非系统角色名；清单与 dump 一起进入私有桶。不包含 Supabase 管理的其他 schema。

## 30 天保留规则（尚未应用）

`deploy/backup-lifecycle.json` 是 S3 生命周期配置，仅使 `database/` 前缀下的备份在 30 天后到期。应用会替换桶的生命周期配置；先读回已有规则，核对后合并。以下写操作需站主本轮明确授权后执行：

应用规则使用具有桶配置权限的管理凭据；每日备份单独使用限定在该私有桶的对象读写凭据。

```sh
AWS_REQUEST_CHECKSUM_CALCULATION=when_required aws --endpoint-url "$R2_ENDPOINT" --region auto s3api put-bucket-lifecycle-configuration --bucket "$BACKUP_BUCKET" --lifecycle-configuration file://deploy/backup-lifecycle.json
aws --endpoint-url "$R2_ENDPOINT" --region auto s3api get-bucket-lifecycle-configuration --bucket "$BACKUP_BUCKET"
```

R2 对该 S3 操作的支持见 [Cloudflare S3 兼容表](https://developers.cloudflare.com/r2/api/s3/api/)。生命周期清理由平台异步执行。

## 媒体约定

播放 URL 的路径为对象 key，查询参数 `token` 为 `base64url(JSON).base64url(HMAC-SHA256)`；签名覆盖第一个 base64url 字符串。声明为 `v=1`、`key`、`subject`、秒级 `iat` / `exp`，有效期 1–3600 秒，路径必须与声明的 key 一致。验签失败先返回 401，再考虑 R2 访问。

`If-Range` 的日期与 Last-Modified 精确到秒匹配才使用区间，遵循 [RFC 9110 §13.1.5](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.5)。多区间请求退回完整响应。配置关闭 Worker 缓存、自动请求日志与 traces，防止完整播放 URL 被记录；响应固定 `Cache-Control: private, no-store`。

> 后续里程碑见 [M1 本地交付报告](./m1-local.md)。

## 未完成项

本轮按站主授权仅作本地提交；未 push、部署、创建或修改云资源。工单 01–04 的外部验收项保持未勾选，待环境准备后补证据。M1 及后续功能尚未实现。`films/`、`.catpaw/` 是本轮外部新增文件，不属于本次实现与提交范围。
