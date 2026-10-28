# mykaoyan 规划

> 状态：v1（2026-10-26）｜术语以 [GLOSSARY.md](../GLOSSARY.md) 为准｜决策见 [adr/](./adr/)｜目录与依赖规则见 [ARCHITECTURE.md](./ARCHITECTURE.md)｜继承的坑点见 [pitfalls.md](./pitfalls.md)

## 1. 目标与边界

面向所有考研人的网站，部署在 `mykaoyan.cn`：

- 发布站主自制的课程（数学二、408 起步）与讲义，看内容对所有人免费。
- 会员可以评论、投稿视频、给投稿评分；评分高的投稿成为推荐。
- 登录后可以跟踪自己的考点进度、错题与复测、每日记录和今日页；单词复习留在浏览器本地。
- 公开一套契约，考生可以用本站的 skill 让自己的 agent 生成进度文件并上传，也可以用 Rust CLI 读写。

本站取代旧站 `portfolio/apps/kaoyan`。旧站冻结，不再加功能；只移植不依赖框架、且有测试的纯函数。

**备考档案与个人工作台（本机选择已实现）**：按站主于 2026-10-27 提出的方向，先设置报考目标、考试组合与当前学习范围，再由备考档案筛选默认工作台。目前已支持三步选择、浏览器草稿保存和按科目展示；账号同步与学习工具仍待实现。背单词、试卷、错题、专题与院校专业的展示规则、范围及推进顺序见 [规划 0002](specs/0002-personal-study-workspace.md)。11408、22408 是组合简称，0854 等专业类别不直接决定考试科目；原有里程碑状态不因此变成已完成。

**不做**：AI 出题；转载真题原文、真题答案和官方公告原件；视频转码和 DRM；App 与小程序（远期，见 §8）；公司注册前的任何支付渠道。

## 2. 红线（所有 Agent 遵守，违反即任务失败）

1. **仓库公开**。不提交 `.env*`、密钥、Supabase 项目 ID 与连接串、ECS IP、真实手机号。示例、fixture、文档一律虚构数据。CI 跑密钥扫描。
2. **不读、不复制**站主备考资料仓库（下称 **SRC**，由派发者以 `$SRC` 提供）中的 `.env*`、`tmp/`、`我的备考档案*`、`择校调研*`、`招生核验*`、`资料来源/真题答案/`。
3. **版权**：真题原文、题图、真题答案、第三方语料与模板、官方公告原件不进入站点和仓库。考点统计只取元数据（科目、年份、题号、题型、考点）。课程讲稿与视频不进仓库，由 CLI 发布到云端；仓库 README 声明内容「保留所有权利」，代码用 MIT。
4. **答案隔离**：题面、索引、列表摘要、站内搜索、OG 卡片、sitemap 都不含解法；示例数值不得取自当前题（见 [pitfalls.md](./pitfalls.md) 隐私与答案）。
5. **个人信息**：不保存密码、身份证号、准考证号、完整证件。手机号只存于账号表，日志与错误报告中脱敏。
6. 代码与文档里不写本机绝对路径。
7. commit、push、部署、创建云资源都要本轮的明确授权（见 [AGENTS.md](../AGENTS.md)）。

## 3. 角色与权限

| 能力 | 访客 | 账号 | 会员 | 管理员 |
| --- | --- | --- | --- | --- |
| 浏览课程、讲义、已上架投稿 | ✓ | ✓ | ✓ | ✓ |
| 学习追踪、进度文件、Agent 令牌 | | ✓ | ✓ | ✓ |
| 评论、投稿、评分 | | | ✓ | ✓ |
| 发布课程、上下架、审核、删评论、开会员、生成兑换码 | | | | ✓ |

评论与投稿还要求账号所在阶段已上线这两个功能（备案通过后，见 [ADR 0005](./adr/0005-accepted-compliance-risks.md)）。

## 4. 里程碑

ICP 备案与 M0 同时进行（审批约 1–3 周）。每个里程碑的验收都要有读回证据，「跳过」不算通过。

| 里程碑 | 范围 | 验收 |
| --- | --- | --- |
| **M0 骨架与实测** | pnpm monorepo、根依赖下沉到各包；`apps/web`、`apps/api` 各一个 Hello 接口；Docker 镜像、ACR、ECS 上 Caddy 与 compose；媒体 Worker 与 R2 桶；CI（fmt、lint、typecheck、test、迁移从空库重放、契约无差异、密钥扫描）；每日 `pg_dump` 到 R2 | 国内三地（至少含晚高峰）实测：首页首字节、`/api/health` 到新加坡数据库的往返、R2 视频持续播放与拖动；数据写进 M0 交付报告 |
| **M1 登录与浏览** | 手机号验证码登录（阿里云短信认证）、出境单独同意、隐私政策；课程、章、讲、讲义的浏览页；讲的视频播放（HMAC 播放令牌）；管理员角色 | 真实手机号收码、登录、退出、会话过期后刷新都在真机跑通；未登录访问学习数据接口 401 |
| **M2 公开契约** | zod 定义与生成的 JSON Schema、OpenAPI；Agent 令牌；进度文件 `GET` / `PUT`（`If-Match`）/ 历史版本；`skills/mykaoyan`；Rust CLI（`login`、`progress pull/push/validate`、`publish`） | skill 在一个全新 agent 会话中按说明生成合法进度文件并上传成功；CLI 从 SRC 的 `课程/` 幂等发布一章，重复发布无变化，且不改上架状态 |
| **M3 学习追踪** | 备考档案、按天计划、错题与复测（重写复测推算，旧版是空壳）、每日记录、今日页、考点进度、周复盘；浏览器本地的词表导入、单词复习与备份 | 复测、复习调度、今日页排序、考点进度推算的纯函数测试；进度文件导入导出往返无损 |
| **M4 会员与社区** | 会员期、手动开通、兑换码；评论（一层回复、关键词过滤、管理员删除）；投稿（预签名分片直传 R2、审核）；评分与推荐 | 非会员调用评论、投稿、评分接口均 403；会员到期后同样 403 且历史内容保留；推荐只由评分推算 |
| **M5 主体资质之后** | 公司注册与 ICP 经营许可证；QQ、微信、支付宝登录（首次绑定手机号）；微信 Native 支付、支付宝电脑网站支付开通会员 | 支付回调验签、幂等、金额对账测试；重复回调不重复开会员期 |
| **远期** | App 与小程序，视 PC 网页版反馈决定 | 见 §8 |

M5 的资质约束（2026-10 调研，签约前复核）：

- 微信支付：个体户支持 Native、不支持 H5，H5 只给企业；小微商户只限线下行业，不能用于网站。业务域名须 ICP 备案，且备案主体与商户主体一致。
- 支付宝：电脑网站支付个人账号也能签约，但额度低；网站须 ICP 备案且主体一致。
- 微信网站应用登录：审核材料要加盖公章，个人主体实际做不了。QQ 互联允许个人提交，但审核结果未核实。
- 因为支付要求备案主体与商户主体一致：站主现在以个人名义备案，公司注册后先做备案主体变更，变更完成后才申请商户号、接入支付和微信登录。变更期间的访问影响在办理前向阿里云备案客服确认。

## 5. 规则

### 5.1 会员（`core/membership`，纯函数）

- 一个会员期固定 365 天。开通时如果当前仍是会员，新会员期从当前会员期结束时开始；否则从开通时刻开始。
- 某时刻是否会员 = 是否落在任一会员期内。不单独存「是否会员」字段，由会员期推算。
- 来源记录在会员期上：`manual`（管理员开通，必须写原因）、`code`（兑换码）、以后的 `wechat_pay` / `alipay`。
- 兑换码一次性，兑换与生成会员期在同一事务内完成；并发兑换同一个码只有一个成功。

### 5.2 评论

- 只有会员能发；挂在讲上；只有一层回复（回复不能再被回复）。
- 发送前做关键词过滤，命中直接拒绝并提示；管理员可删除，删除保留记录（谁、何时、原因），前台显示「已删除」。
- 会员到期后不能再发，已发的保留。

### 5.3 投稿

- 只有会员能投。mp4（H.264），不超过 500MB、不超过 30 分钟；必须选考试科目，考点可选。
- 浏览器向 NestJS 申请预签名 URL，分片直传 R2；上传完成后由 NestJS 读取对象元数据确认大小与类型再登记。
- 投稿状态：待审核 → 已通过（上架）/ 已驳回。驳回的原文件 30 天后删除。
- 删除顺序固定为：先写库标记，再删 R2 对象；替换文件时先传新对象、再写库、成功后删旧对象。

### 5.4 评分与推荐（`core/rating`，纯函数）

- 会员给已上架投稿打 1–5 星，每人每投稿一个评分，可以修改，不能评自己的投稿。
- 排序用贝叶斯平均：`score = (C × m + Σ评分) / (C + n)`，`m` 为全站已上架投稿的平均评分，`C = 10`，`n` 为评分人数。
- `n ≥ 5` 且 `score ≥ 4.0` 的已上架投稿是推荐。`C` 与门槛是常量，改动要同步本节。

### 5.5 进度文件与公开契约

- 进度文件 v1 以旧 kaoyan `progress/v1` 为起点，`app` 改为 `"mykaoyan"`，重新从 v1 开始。
- `GET /api/v1/progress` 返回当前文档与 `ETag`；`PUT` 必须带 `If-Match`，不匹配返回 412，缺失返回 428；成功后追加一条历史版本并返回变更摘要（各类记录的新增、修改、删除条数）。
- 网页上同样可以上传和下载进度文件，走同一套服务层。
- schema 发布在 `https://mykaoyan.cn/schemas/progress/v1/progress.schema.json`，OpenAPI 发布在 `https://mykaoyan.cn/openapi.json`，并有一个文档页。
- 版本规则见 [ADR 0006](./adr/0006-public-contract-from-zod.md)。

### 5.6 复测（`core/mistakes`，纯函数，重写）

- 第一次复测在基准日 + 2 天，基准日初始为订正日期。
- 第一次独立完成后，第二次在这次复测日 + 5 天；第二次也独立完成，错题稳定。
- 任一次结果为「提示后完成」或「不会」，基准日变为这次复测的日期，从第一次复测重新开始。
- 复测日期已过还没做的是逾期，显示「逾期 N 天」，继续等待作答。
- 错题的下次复测日期、第几次、是否稳定、逾期天数都由订正日期和复测记录推算，不单独存储。

### 5.7 单词复习（`core/vocab`，从旧 kaoyan 移植）

- 简化版 SM-2，评分 `again | hard | good | easy`；ease 初始 2.5、下限 1.3；间隔 1 → 3 → `round(interval × ease)`。
- `again`：间隔重置为 1，lapses + 1，ease − 0.2；`hard`：ease − 0.15；`easy`：ease + 0.15，间隔额外 × 1.3。
- 新卡每天最多 30 张，只在当天到期卡清空后引入。日期以 Asia/Shanghai 为准。

### 5.8 计划、今日页、考点进度、周复盘

沿用旧 kaoyan PLAN §5.1、§5.4、§5.6、§5.7 的规则（M3 开工时把原文迁入本节并按本站术语改写）：

- 某天的默认计划取所在阶段的工作日或周末分配，不在任何阶段内的日期不安排分钟；周六、周日按周末算，不处理法定调休；考生可按天覆盖。
- 今日页待办顺序：逾期复测（逾期最久在前）→ 今天的复测 → 到期卡数量 → 新卡数量。
- 考点进度：考生只能手动设置未测、学习中、已练；已练之后由关联错题推算待重测或稳定；没有关联错题的已练考点保持已练。
- 周复盘从周一开始，只读汇总加一段下周调整。

## 6. 域名与环境

备案等待期间，前端按 [ADR 0008](./adr/0008-temporary-web-worker.md) 部署到独立 `mykaoyan-web` Worker，直接使用 `mykaoyan.cn`。按 [ADR 0010](./adr/0010-worker-api-proxy.md)（2026-10-28 确认方案 B），前端继续由 Worker 承载，NestJS API 部署到广州 ECS 的 `api.mykaoyan.cn`，Worker 把 `/api/**` 反代过去；浏览器只访问 `mykaoyan.cn`，因此不需要 CORS，会话 cookie 仍是一方 cookie。备案通过后不切回整站 ECS 方案。

| 主机名 | 归属 | 说明 |
| --- | --- | --- |
| `mykaoyan.cn` | Cloudflare Worker Custom Domain → `mykaoyan-web` | 前端（TanStack Start）与 `/api/**` 反代；线上仍是 M0 Hello 版本，正式首页待发布 |
| `api.mykaoyan.cn` | Cloudflare DNS 仅解析（灰云）→ 广州 ECS（Caddy → NestJS） | 备案通过后加 A 记录并放行 80/443；Caddy 用 HTTP-01 签证书 |
| `www.mykaoyan.cn` | 规划为同一 `mykaoyan-web` Worker | 方案 B 下与主域共用前端，不指向 ECS；本次未调整 |
| `media.mykaoyan.cn` | Cloudflare Worker Custom Domain | 媒体 Worker + R2，不挂 Cloudflare Access |
| `admin.*` 等其他子域 | 暂不使用 | 新增前先更新本表 |

| 环境 | 数据库 | 用途 |
| --- | --- | --- |
| 本地 | Supabase `mykaoyan-dev`（免费版） | `pnpm dev` 直连；本机不跑 Docker |
| CI | GitHub Actions 临时 Postgres 容器 | 迁移从空库重放、集成测试 |
| 生产 | Supabase `mykaoyan-prod`（免费版，新加坡） | 只通过 CI 推送迁移，不在生产调试 |

免费版限制（2026-10 核对 Supabase 定价页）：7 天无访问暂停；没有自动备份和 PITR；每个项目数据库 500 MB；最多 2 个活跃项目。对应措施：上线前每天访问一次健康检查；每天自己 `pg_dump`；数据库用量超过 400 MB 时告警并评估升级 Pro。

迁移顺序：CI 空库重放通过 → 推到 dev → 推到 prod，推之前用 `supabase migration list` 核对。

M0 的本地代码与配置已准备，云端尚未验收，状态见 [本地交付报告](./delivery/m0-local.md)。SQL 由 `packages/db` 的 Drizzle 配置生成到 `supabase/migrations/`，使用 Supabase 时间戳前缀；`migrations.yml` 只手动触发，分别在 dev、prod 推送前后核对迁移列表。每日运维默认关闭，准备好私有桶、保留规则与凭据后再启用。

## 7. 技术方案

- **前端** `apps/web`：TanStack Start 1.x（2026-10-13 发布 1.0 稳定版；Vite 加 `nitro()` 插件构建为 Node 服务，`node .output/server/index.mjs` 启动）、React、tailwind v4、shadcn（base-ui）、zustand、Motion（包名 `motion`，从 `motion/react` 导入）、GSAP。服务端渲染时带上用户 cookie 调 NestJS，不写业务逻辑。
  - GSAP 含全部插件免费、可商用（npm 许可证字段为 "Standard 'no charge' license"）；许可证全文本次未抓到，上线前核对是否有限制条款。
- **后端** `apps/api`：NestJS + Better Auth + Drizzle。业务逻辑全部在服务层，网页和 `/api/v1` 共用。
  - Better Auth 没有官方 NestJS 集成，用社区维护的 `@thallesp/nestjs-better-auth`（需关闭 NestJS 的 `bodyParser`）。M1 先做一个最小登录切片验证它，不行就在 NestJS 里直接挂 Better Auth 的 handler。
  - 手机号登录用 Better Auth `phoneNumber` 插件，`sendOTP` 调阿里云号码认证 `SendSmsVerifyCode`，`verifyOTP` 调 `CheckSmsVerifyCode`：验证码由阿里云生成和校验。不要自己生成验证码再传给阿里云，那样 `CheckSmsVerifyCode` 不负责校验，只能自己存储比对。验证即注册需要 `getTempEmail` 生成占位邮箱，占位邮箱不对外展示、不用于发信。号码认证套餐包要单独购买，短信服务的套餐包不能抵扣。
  - Drizzle 用 postgres.js 连 Supavisor transaction 模式（6543 端口，IPv4），必须设 `prepare: false`；SSL `verify-full`。Supabase 直连地址默认只有 IPv6，不用。
- **媒体** `apps/media-worker`：Cloudflare Worker，校验 HMAC 播放令牌后从 R2 读取并支持 Range。
- **CLI** `apps/cli`：Rust（clap），类型从 OpenAPI 生成。
- **Skill** `skills/mykaoyan`：按 agentskills.io 规范，包含进度文件说明、零依赖校验脚本、空白模板。
- **部署**：API 由 GitHub Actions 构建镜像 → 阿里云 ACR → SSH 到广州 ECS 执行 `docker compose pull && up -d` → 冒烟 `/api/health` 200 且连上数据库；前端 Worker 用 `pnpm --filter @mykaoyan/web deploy:workers` 手动发布。镜像中不含任何密钥，密钥只在 ECS 的 `.env`。
- **ECS**：广州（华南 3），2 核 4G，固定带宽 3–5 Mbps，云监控在 CPU、内存、磁盘持续超过 80% 时告警。
- **备份**：每天 `pg_dump` 到 R2 私有桶，保留 30 天，每月演练一次恢复。

M0 的前端生产启动入口为 `pnpm --filter @mykaoyan/web start`：先用 zod 验证 `NODE_ENV`、`HOST`、`PORT`，再加载 Nitro 的 `.output/server/index.mjs`；不直接绕过启动校验运行产物。

## 8. 远期：App 与小程序

现在只守住三条，以免返工：

1. **接口优先**：所有业务能力都有 `/api/v1` 接口，网页不走私有捷径。
2. **账号与登录方式分表**，微信登录存 unionid。
3. **支付约束**：iOS App 内卖会员必须走苹果内购（抽成 15%–30%）；微信小程序在 iOS 上的虚拟支付有限制，需要单独资质。

## 9. 待决

| 问题 | 默认处理（站主可推翻） |
| --- | --- |
| 评论是否也挂在投稿上 | 不挂，v1 只评论讲 |
| 会员价格变动时已售兑换码怎么算 | 兑换码只对应「一个会员期」，与价格无关 |
| 中文字体 | 用系统字体栈，不自托管中文字体 |
| SRC 历史学习记录是否回填 | 由站主的 agent 通过 skill 上传进度文件回填，不写导入脚本 |
