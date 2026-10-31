# mykaoyan 会话考古踩坑指南

本目录由 `agent-session-archaeology` 技能对 mykaoyan 仓库的历史 agent 会话做增量评审后生成，分两批：第一批是 2026-10-28 至 2026-10-31 的 17 个会话（16 个 DSH、1 个 Codex，在另一台机器上生成后提交）；第二批（2026-10-31 增量）覆盖本机 macOS 上 2026-10-26 至 2026-10-30 的 **47 个顶层会话**（16 个 DSH、7 个 Claude Code、24 个 Codex），并对最大的 DSH 会话按行段做了补读。当次考古会话本身作为自审计对象排除。

和 [docs/pitfalls.md](../pitfalls.md) 的分工：pitfalls.md 是从旧仓库指南继承并增补的**规则清单**，一句话一条；本目录是**证据档案**，每条坑都带四段式过程和可回读的原始会话坐标，供人或 agent 在复现同类问题时定位上下文。两边编号独立，正文里会互相引用。

## 怎么读

- 先看下面自动索引里的「全部记录」，按严重度挑当前要处理的。
- 每条记录按四段读：**症状 → 诊断 → 方案取舍 → 结果与验证**。状态是 `resolved` 只覆盖当次实际验证过的范围；`partial`、`unresolved`、`hypothesis` 都按字面理解，不要当成已解决。
- 证据坐标里的行号是**脱敏导出 Markdown 的物理行号**（`.agent-sessions/dsh--*.md`、`.agent-sessions/codex--*.md`），不是原始 JSONL 行号；导出目录已在 `.gitignore` 中，不在仓库里。原始会话坐标另写在每条记录的 `source` 里。

## 证据与坐标

- 每条独立记录的原始摘录归档在 [evidence.gz](./evidence.gz)，用 `search evidence show --guide docs/avoiding-pitfalls-guide --id <ID>` 可以单条回读，不需要解压整个档案（技能环境的 CLI 当前名为 `search`，旧名是 `sarch`）。
- 引用入口（`reference`）不重复存证据，指向被引用的独立记录。
- 摘录只保留与坑相关的 20–80 行，不存放整段会话。

## 维护方式

- 增量更新：重跑会话评审时先 `search --json guide inventory` 比对已有 ID 与来源，重复事实合并进原记录，新事实追加在对应章节末尾并沿用 `nextIds`。
- 章节文件按主题划分，编号连续、无空占位；新增主题时顺延文件名，并在仓库里修好指向旧文件名的链接。
- 每条记录的元数据行保持 `` `batch` `` / `` `severity` `` / `` `status` `` / `` `source` `` 四个标签不翻译；修改后跑 `search guide index` 重建索引，再跑 `search guide check` 校验证据覆盖率与体积预算。

<!-- BEGIN:auto-index -->
## 主题索引

| 主题 | 独立记录 | 引用入口 | 覆盖 |
| --- | --- | --- | --- |
| [验证与验收口径](./01-verification.md) | 24 | 0 | 交付时说“通过了”，不等于真的验证过；这一章收的是 dry-run 全绿、job 状态、typecheck 声明与测试夹具自己出错这几类假信号。 |
| [数据契约与口径](./02-data-contracts.md) | 9 | 0 | 同一个字段在不同来源、不同年份、不同 agent 手里会变成不同语义；这一章收的是数据转换与权限口径的漂移。 |
| [数据库与迁移](./03-database.md) | 8 | 0 | 生产库没有迁移历史表、pooler 要自签 CA、drizzle 不生成 REVOKE、Windows 的 psql 还有编码坑；这一章收数据库层反复出现的几个硬点。 |
| [认证与凭据](./04-auth.md) | 6 | 0 | 身份模型错位、凭据不进对话、云账号权限与“登录成功”的假象；这一章收认证链路上“看起来登进去了、其实身份或权限不对”的几类失败。 |
| [部署与生产操作](./05-deploy.md) | 15 | 0 | 一次“上传代码”背后有 SSH 主机密钥、镜像仓库、Docker 构建上下文、ECS 运行时配置四层；这一章收这条链上真实断掉的点。 |
| [多 Agent 协作与工作流](./06-agent-workflow.md) | 23 | 0 | 并行 agent 不是为了更快地互相踩；这一章收的是共用工作区、提交纪律、需求边界和串行执行四类协作失败。 |
| [Windows 本地工具链](./07-tools.md) | 11 | 0 | 这台 Windows 机器上的 PowerShell 5.1/7、编码、Python、Postgres、安装脚本与退出码，构成了本仓库最高频的“假失败/假成功”来源。 |
| [本地环境与沙箱](./08-local-environment.md) | 13 | 0 | 这台 macOS 机器的沙箱、pnpm、formatter 与语言服务器，替 agent 制造了另一批“假失败/假成功”；这一章收的是环境边界本身。 |
| [前端样式与设计](./09-frontend.md) | 3 | 0 | 设计流程产物与工程栈脱节、样式类静默不生成、迁移丢行为；这一章收前端样式链路上“构建全绿但页面不对”的几类失败。 |
| [模块与导入规约](./10-module-conventions.md) | 1 | 0 | 框架文档的默认目录结构与站主自己的规约不是一回事；这一章收的是重构前后“谁说了算”的冲突。 |
| [内容管线与课程库](./11-content-pipeline.md) | 1 | 0 | 视频与讲稿的目录结构，是被 `lessons/` 源头的文件名决定的；这一章收内容管线里“CLI 直接发布失败”的那些前置条件。 |

**114 条独立记录，0 个去重引用入口，分为 11 个主题。**

## 全部记录

| ID | 坑点 | 主题 | 严重度 | 状态 |
| --- | --- | --- | --- | --- |
| [AGENT-01](./06-agent-workflow.md#agent-01) | 多个并行 agent 共用工作区：整包 typecheck 的失败不能默认归因自己 | 多 Agent 协作与工作流 | high | partial |
| [AGENT-02](./06-agent-workflow.md#agent-02) | 提交前不看 index：一次“上传代码”把本机技能 junction 展开成 1666 行提交进远端 | 多 Agent 协作与工作流 | critical | resolved |
| [AGENT-03](./06-agent-workflow.md#agent-03) | 「上传代码」30 分钟没有中间进度：用户等到爆粗 | 多 Agent 协作与工作流 | critical | partial |
| [AGENT-04](./06-agent-workflow.md#agent-04) | 把“上传课程”实现成只发视频，用户纠正才补试题与 OpenAPI/JSON Schema | 多 Agent 协作与工作流 | high | resolved |
| [AGENT-05](./06-agent-workflow.md#agent-05) | 重活先串行做、被用户催“多开几个 Agent”才并行 | 多 Agent 协作与工作流 | medium | resolved |
| [AGENT-06](./06-agent-workflow.md#agent-06) | 任务卡里的路径和假设要先复核，与文件正文冲突时以正文为准 | 多 Agent 协作与工作流 | low | resolved |
| [AGENT-07](./06-agent-workflow.md#agent-07) | 用户确认“没有其他会话写入”后外部提交仍落到 HEAD：根 TypeScript 被换 7.0.2，已通过的构建结论当场作废 | 多 Agent 协作与工作流 | high | partial |
| [AGENT-08](./06-agent-workflow.md#agent-08) | 把用户一句「都走国内」扩大成整站境内，凭未核实调研建议作废已确认的 Cloudflare/Supabase 架构 | 多 Agent 协作与工作流 | medium | resolved |
| [AGENT-09](./06-agent-workflow.md#agent-09) | 「简体中文最高优先级」规则首轮没生效：8 个调研问题全用英文，用户只回「中文回答」后才切换 | 多 Agent 协作与工作流 | low | resolved |
| [AGENT-10](./06-agent-workflow.md#agent-10) | 未经确认就把临时部署目标定成 `workers.dev` 并写进 ADR，用户一句「不能部署在 mykaoyan.cn 吗」才改绑主域名 | 多 Agent 协作与工作流 | medium | resolved |
| [AGENT-11](./06-agent-workflow.md#agent-11) | 把 M0 占位 Hello 页部署到正式主域并当作主要交付结果，用户反问「这和规划的对吗？」 | 多 Agent 协作与工作流 | high | resolved |
| [AGENT-12](./06-agent-workflow.md#agent-12) | 回复里的占位符 `postgresql://...` 被用户原样粘进 `.env`：校验通过、API 能启动，查库接口实际 503 | 多 Agent 协作与工作流 | high | resolved |
| [AGENT-13](./06-agent-workflow.md#agent-13) | 本地没有数据库，agent 却加了一套本机 Postgres 集群，用户两次纠正后全部回滚 | 多 Agent 协作与工作流 | high | resolved |
| [AGENT-14](./06-agent-workflow.md#agent-14) | 对 TanStack Router 生成的 `routeTree.gen.ts` 做「高内聚低耦合」拆分，15 个架构测试红后完整回滚 | 多 Agent 协作与工作流 | medium | resolved |
| [AGENT-15](./06-agent-workflow.md#agent-15) | 用户批准强制覆盖的是提交 `1abb794`，并发会话两分钟后重建 HEAD：`--force-with-lease` 只锁远程不锁本地 | 多 Agent 协作与工作流 | critical | partial |
| [AGENT-16](./06-agent-workflow.md#agent-16) | 同工作区的并发会话重写 git 历史：我的提交被 reset 合并，别人的 57 个暂存文件混进我的提交 | 多 Agent 协作与工作流 | critical | partial |
| [AGENT-17](./06-agent-workflow.md#agent-17) | `git commit -- <路径>` 不能隔离同一文件里别人的未提交改动：工单提交把另一会话 21 行捎进 HEAD | 多 Agent 协作与工作流 | high | resolved |
| [AGENT-18](./06-agent-workflow.md#agent-18) | 把站主刚移到子目录的测试文件当成「外部删除」，`git checkout HEAD --` 恢复出根级重复副本 | 多 Agent 协作与工作流 | high | resolved |
| [AGENT-19](./06-agent-workflow.md#agent-19) | 相邻目录已有并发会话交付同一适配器，本会话仍新建目录派两名队友做第二套实现 | 多 Agent 协作与工作流 | high | resolved |
| [AGENT-20](./06-agent-workflow.md#agent-20) | 从备案进度截图推断「ECS 没买」，连续两轮误判：截图不能替代资产查询 | 多 Agent 协作与工作流 | high | resolved |
| [AGENT-21](./06-agent-workflow.md#agent-21) | 交接会话拿到空简报和原线程链接，却先重做整套调研：整版规划作废 | 多 Agent 协作与工作流 | high | partial |
| [AGENT-22](./06-agent-workflow.md#agent-22) | `/grill-with-docs` 访谈没收敛就落盘：4 份主体结构文档按错误主干写完，跨 17 小时整体重写 | 多 Agent 协作与工作流 | medium | resolved |
| [AGENT-23](./06-agent-workflow.md#agent-23) | runbook 白纸黑字「备案通过前不动 DNS」，agent 仍把切 NS 设为让主域显示网页的唯一一步 | 多 Agent 协作与工作流 | high | resolved |
| [AUTH-01](./04-auth.md#auth-01) | 管理员用邮箱预建，站点只有手机号验证码登录：管理端登不进去 | 认证与凭据 | high | partial |
| [AUTH-02](./04-auth.md#auth-02) | 凭据不进对话：交互式配置 + 掩码输出；但脱敏脚本自身也会写错 | 认证与凭据 | medium | resolved |
| [AUTH-03](./04-auth.md#auth-03) | 把本机 Wrangler 的 OAuth token 当 API Token 用：`whoami` 报 tokenValid true，读 DNS 仍 403 | 认证与凭据 | medium | partial |
| [AUTH-04](./04-auth.md#auth-04) | 生产校验强制 `SMS_PROVIDER=aliyun`，而资质未办只能用 memory：验证码不留可读通道，登录卡死 | 认证与凭据 | medium | unresolved |
| [AUTH-05](./04-auth.md#auth-05) | 同页登录成功后 `location.assign` 同一地址不刷新，服务端会话没生效 | 认证与凭据 | medium | resolved |
| [AUTH-06](./04-auth.md#auth-06) | 排查域名时原样跑 whois 与 sts GetCallerIdentity，把注册人姓名/邮箱与 RAM AccountId/Arn 打进会话 | 认证与凭据 | high | resolved |
| [DATA-01](./02-data-contracts.md#data-01) | 同一科目的卷型逐年在变，任务卡的统一结构是错的 | 数据契约与口径 | high | partial |
| [DATA-02](./02-data-contracts.md#data-02) | 同一份「答案」有两代结构；任务卡说的「双源对照」根本不含答案 | 数据契约与口径 | high | resolved |
| [DATA-03](./02-data-contracts.md#data-03) | 源数据本身有缺陷时，契约没有「表达缺陷」的位置 | 数据契约与口径 | high | unresolved |
| [DATA-04](./02-data-contracts.md#data-04) | 两个并行导入员对同一契约给出两种语义 | 数据契约与口径 | medium | unresolved |
| [DATA-05](./02-data-contracts.md#data-05) | 会员门口径从「两处」变「三处」，文档、验收表和前端代码各自漂移 | 数据契约与口径 | high | partial |
| [DATA-06](./02-data-contracts.md#data-06) | 派单消息与 spec 冲突时，三个 agent 各按文档实现并把冲突留给 Lead 拍板 | 数据契约与口径 | medium | partial |
| [DATA-07](./02-data-contracts.md#data-07) | 用户口头给的考试代码 `22407` 是班级号：查证后用选择题澄清为 `22408`，再把三层代码拆开 | 数据契约与口径 | medium | resolved |
| [DATA-08](./02-data-contracts.md#data-08) | 研招网目录没有学院列表、只有 2027 一个年度，翻页「请登录」还伪装成 HTTP 200 | 数据契约与口径 | high | resolved |
| [DATA-09](./02-data-contracts.md#data-09) | JSON Schema 的 `integer` 允许 `45.0`/`45e0`，Rust 侧拒绝反序列化，合法进度文件被拒 | 数据契约与口径 | medium | resolved |
| [DB-01](./03-database.md#db-01) | 原生 SQL 的 timestamptz 返回字符串，发布接口 500 | 数据库与迁移 | high | resolved |
| [DB-02](./03-database.md#db-02) | 生产库落后 8 个迁移，而且没有迁移历史表 | 数据库与迁移 | high | resolved |
| [DB-03](./03-database.md#db-03) | Supabase pooler：自签 Root 2021 CA，且必须先发 PostgreSQL SSLRequest 再升级 TLS | 数据库与迁移 | high | resolved |
| [DB-04](./03-database.md#db-04) | drizzle-kit 生成的迁移不含 REVOKE，新表默认对 PUBLIC 开放 | 数据库与迁移 | high | resolved |
| [DB-05](./03-database.md#db-05) | Windows 临时库的 psql：中文参数报 invalid byte sequence；DROP DATABASE 混在事务里失败留脏库 | 数据库与迁移 | medium | resolved |
| [DB-06](./03-database.md#db-06) | reviewer 外键与「已审核必有审核人」check 冲突 | 数据库与迁移 | medium | resolved |
| [DB-07](./03-database.md#db-07) | pg_restore 到空库先撞 `schema "public" already exists`；重建 public 后又因 PUBLIC 权限未重放，业务角色读表 500 | 数据库与迁移 | high | resolved |
| [DB-08](./03-database.md#db-08) | 两条 Supabase 连接串 project ref 相同但 pooler 地域不同：自检只比 ref 就报「一致」 | 数据库与迁移 | medium | resolved |
| [DEPLOY-01](./05-deploy.md#deploy-01) | 部署 workflow 硬性要求 `DEPLOY_KNOWN_HOSTS`，用户暴怒后才承认是自己加的 | 部署与生产操作 | high | resolved |
| [DEPLOY-02](./05-deploy.md#deploy-02) | 镜像仓库域名 NXDOMAIN：ACR 个人版实例已失效，改走 SSH 直传镜像 | 部署与生产操作 | high | resolved |
| [DEPLOY-03](./05-deploy.md#deploy-03) | `.dockerignore` 白名单漏了 `scripts/`、`skills/`，镜像内 postinstall 失败 | 部署与生产操作 | high | resolved |
| [DEPLOY-04](./05-deploy.md#deploy-04) | ECS 运行时 `.env` 缺生产短信配置，API 容器 restart loop，部署“成功”但登录不可用 | 部署与生产操作 | high | resolved |
| [DEPLOY-05](./05-deploy.md#deploy-05) | `cf build --mode workers` 不支持自定义 mode：要构建 `vite build --mode workers`，发布才用 `cf deploy --prebuilt` | 部署与生产操作 | low | resolved |
| [DEPLOY-06](./05-deploy.md#deploy-06) | Cloudflare Workers Builds 默认 `npx wrangler deploy` 在 pnpm 仓库被打红（EBADDEVENGINES），云端 Worker 名还与 `wrangler.jsonc` 不一致 | 部署与生产操作 | high | resolved |
| [DEPLOY-07](./05-deploy.md#deploy-07) | 一次失败的重试部署也会真实创建云资源：Wrangler 自动开通 R2 桶 `mykaoyan-media`（WEUR） | 部署与生产操作 | high | partial |
| [DEPLOY-08](./05-deploy.md#deploy-08) | `wrangler.jsonc` 不是纯 JSON：测试里 `JSON.parse` 直接 SyntaxError，要用 `unstable_readConfig` | 部署与生产操作 | low | resolved |
| [DEPLOY-09](./05-deploy.md#deploy-09) | Worker 部署成功、Custom Domain 也绑定了，但权威 DNS 还在万网：浏览器 `NXDOMAIN`，边缘直连 200 只证明部署生效 | 部署与生产操作 | high | unresolved |
| [DEPLOY-10](./05-deploy.md#deploy-10) | 未备案域名被阿里云按 Host 头拦截：纯 IP 200、带域名 403，换非标端口也照拦 | 部署与生产操作 | medium | resolved |
| [DEPLOY-11](./05-deploy.md#deploy-11) | 本机走多出口 NAT，`/32` 白名单「加了也没用」：两次查询拿到两个不同出口 IP | 部署与生产操作 | medium | resolved |
| [DEPLOY-12](./05-deploy.md#deploy-12) | 手动部署 workflow 首跑就会失败：API 镜像不产出 dist、Worker 不转发 /api、跨子域 cookie 未配 | 部署与生产操作 | high | resolved |
| [DEPLOY-13](./05-deploy.md#deploy-13) | 本机 `node --import tsx` 能跑不等于 `pnpm deploy` 产物能跑：发布包缺 tsconfig，容器里装饰器编译报错直接崩 | 部署与生产操作 | high | resolved |
| [DEPLOY-15](./05-deploy.md#deploy-15) | ICP 备案备注建议写「不涉及评论、用户上传音视频」，与仓库规划 M4 的评论与投稿视频冲突 | 部署与生产操作 | medium | unresolved |
| [DEPLOY-16](./05-deploy.md#deploy-16) | 课程发布链路七处缺口：上传成功访客也看不到，线上镜像还不含发布 API/CLI | 部署与生产操作 | high | unresolved |
| [ENV-01](./08-local-environment.md#env-01) | pnpm 12 的 Agent Skills 联动：批准了依赖自带 skills 却未声明 `skills.dirs`，整个 install 被中止 | 本地环境与沙箱 | medium | resolved |
| [ENV-02](./08-local-environment.md#env-02) | 沙箱三处硬限制被当成代码失败：写不了 `~/.codex`、监听不了 127.0.0.1、连不上研招网 | 本地环境与沙箱 | high | resolved |
| [ENV-03](./08-local-environment.md#env-03) | macOS 沙箱跑 Playwright：Chromium 要 `--single-process --no-zygote`，本地 HTTP 服务改 route 拦截 | 本地环境与沙箱 | high | resolved |
| [ENV-04](./08-local-environment.md#env-04) | 沙箱网络白名单是“会话语义”：`allowed_domains` 扩不宽，云 API 只能改走用户终端 | 本地环境与沙箱 | high | partial |
| [ENV-05](./08-local-environment.md#env-05) | pnpm 钉死版本在受限沙箱跑不了 `pnpm exec`，又被并发会话改成不存在的 12.15.1 | 本地环境与沙箱 | high | partial |
| [ENV-06](./08-local-environment.md#env-06) | 把 oxlint `--fix` 当成能改箭头函数：内置 `func-style` 没有 fixer，只能写本地插件 | 本地环境与沙箱 | medium | resolved |
| [ENV-07](./08-local-environment.md#env-07) | 在多个会话共享的脏工作区里首次启用 formatter：`--check` 一次报 327 个文件、别人已 staged 58 个 | 本地环境与沙箱 | medium | resolved |
| [ENV-08](./08-local-environment.md#env-08) | 新生成物没进 formatter 忽略清单：`pnpm fmt` 把 schema 压成单行，与生成器输出冲突 | 本地环境与沙箱 | high | unresolved |
| [ENV-09](./08-local-environment.md#env-09) | 编辑器/语言服务器报错骗人：rust-analyzer 把 std prelude 宏全判 unresolved，空工程可复现 | 本地环境与沙箱 | medium | hypothesis |
| [ENV-10](./08-local-environment.md#env-10) | 没实测就断定「写注释必须用 `.jsonc`」：改名后实测 schema 允许注释又改回 `.json` | 本地环境与沙箱 | low | resolved |
| [ENV-11](./08-local-environment.md#env-11) | 本机 skill 校验器缺依赖且不认规范字段：`ModuleNotFoundError` + `Unexpected key` | 本地环境与沙箱 | low | resolved |
| [ENV-12](./08-local-environment.md#env-12) | `npx` 在本仓库被 devEngines 拒绝，整个检查链要改用 `./node_modules/.bin/` | 本地环境与沙箱 | high | resolved |
| [ENV-13](./08-local-environment.md#env-13) | 云助手 CLI 两个语义坑：`Output` 默认 base64、`InvocationStatus=Timeout` 是终态却当中间态轮询 | 本地环境与沙箱 | low | resolved |
| [MOD-01](./10-module-conventions.md#mod-01) | 按框架默认摊平 `apps/api` 并用 NodeNext 强制 `.js` 后缀：站主连发 6 条纠正才落到域目录 + 省略扩展名 | 模块与导入规约 | high | resolved |
| [PIPE-01](./11-content-pipeline.md#pipe-01) | 课程库 68 支视频有 3 处路径含 `/` 把章目录打散、一稿四视频、README 状态与磁盘相反 | 内容管线与课程库 | high | unresolved |
| [TOOL-01](./07-tools.md#tool-01) | 用 PowerShell 批量改写源码：中文写坏、`-NoNewline` 并行、重写又引入新错 | Windows 本地工具链 | high | resolved |
| [TOOL-02](./07-tools.md#tool-02) | 跑过 fmt/oxfmt 之后再 edit：`file changed since it was read` 与 `offset out of range` | Windows 本地工具链 | medium | resolved |
| [TOOL-03](./07-tools.md#tool-03) | PowerShell 写文件带 BOM，`JSON.parse` 直接抛 `Unexpected token '﻿'` | Windows 本地工具链 | medium | resolved |
| [TOOL-04](./07-tools.md#tool-04) | Windows 跑 Python 的三个固定坑：Store 存根、控制台乱码、here-string 丢反斜杠 | Windows 本地工具链 | medium | resolved |
| [TOOL-05](./07-tools.md#tool-05) | 环境探测误判：PostgreSQL 装在 `D:\DevelopmentTools`，不在 PATH、不在 Program Files | Windows 本地工具链 | high | resolved |
| [TOOL-06](./07-tools.md#tool-06) | 固定手机号触发验证码 60 秒冷却，全量测试随机 429（规则第二次被复现） | Windows 本地工具链 | medium | resolved |
| [TOOL-07](./07-tools.md#tool-07) | sarch 在 Windows 的安装与退出码语义：make/gcc 不可用，scan/export exit 1 也不代表缺少会话 | Windows 本地工具链 | low | resolved |
| [TOOL-08](./07-tools.md#tool-08) | 第三方安装脚本注释与代码不一致；装完 PATH 不刷新 | Windows 本地工具链 | low | resolved |
| [TOOL-09](./07-tools.md#tool-09) | Windows PowerShell 向远程 Linux 传多行命令：引号会被吃掉，改用 base64 | Windows 本地工具链 | low | resolved |
| [TOOL-10](./07-tools.md#tool-10) | pnpm 往 stderr 写日志，PowerShell 报 exit 1 的假失败 | Windows 本地工具链 | medium | resolved |
| [TOOL-11](./07-tools.md#tool-11) | `pg_ctl -w start` 在 PowerShell 后台 job 里挂住，`job_kill` 会连带杀掉临时集群 | Windows 本地工具链 | medium | resolved |
| [UI-01](./09-frontend.md#ui-01) | 设计流程产物与既定技术栈脱节：6 个手写 CSS、1297 行、81 个自定义类名，`tailwindcss` 依赖 0 处 | 前端样式与设计 | high | resolved |
| [UI-02](./09-frontend.md#ui-02) | Tailwind v4 少了 `@plugin` 声明：`prose-*` 类静默不生成，`vite build` 仍 EXIT=0 | 前端样式与设计 | high | resolved |
| [UI-03](./09-frontend.md#ui-03) | 手写 CSS 到 Tailwind/shadcn 迁移丢了 4 处行为：横向溢出、链接无下划线、点击区 37.7px、加载态不可感知 | 前端样式与设计 | high | resolved |
| [VER-01](./01-verification.md#ver-01) | dry-run 全绿只证明契约合法，不证明内容正确 | 验证与验收口径 | high | partial |
| [VER-02](./01-verification.md#ver-02) | 后台 job 报 completed / exit 0，可能正是失败现场 | 验证与验收口径 | high | resolved |
| [VER-03](./01-verification.md#ver-03) | 集成测试自建 Nest 应用，合法 1 MB 请求被默认 100 kB 上限打成 500 | 验证与验收口径 | high | resolved |
| [VER-04](./01-verification.md#ver-04) | 「待 Lead 跑」不是验证：迁移重放拖到四小时后，第一次就 4 项红 | 验证与验收口径 | high | resolved |
| [VER-05](./01-verification.md#ver-05) | 测试夹具和断言自己会错：写死字节数、把合法输入当非法用例 | 验证与验收口径 | medium | resolved |
| [VER-06](./01-verification.md#ver-06) | 验收表写着 typecheck 全仓通过，HEAD 实际编译失败；静态审查不跑守卫 | 验证与验收口径 | high | resolved |
| [VER-07](./01-verification.md#ver-07) | 汇报里的汇总数字也要按全集计数：11 套含图写成 12 套 | 验证与验收口径 | medium | partial |
| [VER-08](./01-verification.md#ver-08) | 新增的测试文件被 vitest include 漏收：`pnpm test` 仍报 4 文件 14 测试全绿 | 验证与验收口径 | high | resolved |
| [VER-09](./01-verification.md#ver-09) | 设计门禁的三层假信号：渲染层根本没跑、dev 浮层被当成页面问题、格式不对的 waiver 静默失效 | 验证与验收口径 | medium | resolved |
| [VER-10](./01-verification.md#ver-10) | 部署成功后的首轮线上探针连报 TypeError / DOMException / curl 28，看着像密钥不一致 | 验证与验收口径 | medium | resolved |
| [VER-11](./01-verification.md#ver-11) | 「抓取 2026-10-26」的调研结论无法复现：同一 URL 只返回页面标题，仍被写成已核实并进仓库规划 | 验证与验收口径 | medium | hypothesis |
| [VER-12](./01-verification.md#ver-12) | 验收文档写 17 个单测全过，服务却从没启动过：用户第一次打开接口就是 500 | 验证与验收口径 | high | resolved |
| [VER-13](./01-verification.md#ver-13) | 架构守卫既误报又误导：`endsWith("")` 把合法跨目录导入全判红，“每包自声明”规则又诱导重复声明 | 验证与验收口径 | medium | resolved |
| [VER-14](./01-verification.md#ver-14) | CI 红在 gitleaks「扫到 3 个密钥」，实际是三个 localStorage 键名被 `generic-api-key` 误判 | 验证与验收口径 | medium | resolved |
| [VER-15](./01-verification.md#ver-15) | 只读复查把 API 换到 3101，但 Vite devProxy 硬编码 3001：浏览器验证实际打到另一会话的 API 实例 | 验证与验收口径 | high | resolved |
| [VER-16](./01-verification.md#ver-16) | SSR 已渲染的按钮不等于可点击：CDP 第一次点「设置我的备考」因 React 未 hydrate 而超时 | 验证与验收口径 | medium | resolved |
| [VER-17](./01-verification.md#ver-17) | 交付报告写「已浏览器实测显示 M0 页面」，实际主域没有任何解析：把控制台配置回读当上线验收 | 验证与验收口径 | high | resolved |
| [VER-18](./01-verification.md#ver-18) | Nest 12 默认 `abortOnError` 把启动错误吞成 SIGABRT：测试崩了却看不到依赖注入报错 | 验证与验收口径 | high | resolved |
| [VER-19](./01-verification.md#ver-19) | 工单验收项写着 `[x]` 但仓库里没有对应接口：只按实现者汇报勾选 | 验证与验收口径 | high | partial |
| [VER-20](./01-verification.md#ver-20) | 全片渲染卡在 Canvas `addColorStop` 把数字当颜色：Python traceback 掩盖真正的 JS 异常 | 验证与验收口径 | medium | unresolved |
| [VER-21](./01-verification.md#ver-21) | 新增集成测试没清理自己写的表，既有测试删账号被外键挡住，全量 2 红 | 验证与验收口径 | medium | resolved |
| [VER-22](./01-verification.md#ver-22) | 发布功能的失败信号三处失真：删旧对象失败仍报「无需清理」、答案文件不报告、权限不足报 401 | 验证与验收口径 | high | partial |
| [VER-23](./01-verification.md#ver-23) | 验收通过时对象正被并发会话改写：走查的是迁移完成前的版本，也没有记录被验收文件哈希 | 验证与验收口径 | high | partial |
| [VER-24](./01-verification.md#ver-24) | 适配器 41 项测试 + verify 18/18 全绿，但 keyword+省份组合查询永远返回空数组 | 验证与验收口径 | high | resolved |

## 统计

- 独立记录：**114**；去重引用入口：**0**
- 批次：`2026-10-31`
- 严重度：critical 4 · high 61 · low 10 · medium 39
- 状态：hypothesis 2 · partial 19 · resolved 84 · unresolved 9
- 带归档证据：114
<!-- END:auto-index -->

## 本批范围与状态

- **第二批（2026-10-31 增量，本机 macOS）**：`search --json sessions scan --project .` 找到与本仓库 cwd 相关的 77 个会话（39 DSH、14 Claude Code、24 Codex）。评审对象是其中 **47 个顶层会话**（16 DSH 开发会话 + 7 Claude Code + 24 Codex，时间 10-26～10-30）；另把 22 个 DSH 子代理与 7 个 Claude Code 子代理作为按需取证，不单独出条目。采集当天再次同步导出时，`167c8cf8` 与 `59199c0f` 两个会话的导出被重新生成过（行数 +1 / +19），对应证据坐标以最终导出为准。
- **执行方式**：20 个「评审单元 + 补读单元」并行评审（u01–u20），每个单元写自己的 `findings/*.md`（覆盖记录 + F/D 四段式），Lead 只做去重、ID 分配、证据归档与章节写作。共识别 114 条独立发现 + 40 余条去重补充，合并为 **72 条新记录**；新增 4 个主题（08 本地环境与沙箱、09 前端样式与设计、10 模块与导入规约、11 内容管线与课程库），既有 7 章只追加、未改写旧记录。
- **覆盖说明**：47 个顶层会话全部被评审（每份 findings 都有逐会话的 `read_ranges` / `unread_ranges` / `omissions`）。大文件没有全部逐行通读：最大 DSH 会话（28985 行）拆成 1–15306 / 15307–19961 / 19962–28985 三段补读，其余会话按“窗口精读 + 全量消息索引 + 错误关键词扫描”处理，**未读区间已在各 findings 中逐段列明**；结论只引用实读窗口的逐字证据。
- **第一批（2026-10-28～10-31，另一台机器）**：17 个会话（16 DSH + 1 Codex），第一批 42 条记录作为本批基线保留，未重写。第一批遗留的 `session-e9a3218d…`、`session-65bd944f…` 两条报告不在本机，未能按增量流程追加；其上下文不影响本批结论。
- **证据与归档**：新记录的证据段从 `.agent-sessions/*.md`（脱敏导出，gitignore）按行号裁剪后写入 `evidence.gz`；导出中的本机绝对路径已统一改写为 `~/`。`search evidence check` 通过（107 段独立记录、0 个孤立段），`search guide check` 通过。
- **`incomplete: true` 的含义**：扫描/导出以 exit 1 结束来自 DSH registry 与 cwd 发现的会话数差异（`dsh_expected=17`、`dsh_found=39`、`missing=[]`），不是会话缺失；详见 TOOL-07。

