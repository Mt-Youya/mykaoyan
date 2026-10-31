# mykaoyan 会话考古踩坑指南

本目录由 `agent-session-archaeology` 技能对 mykaoyan 仓库的历史 agent 会话做增量评审后生成。评审范围是 2026-10-28 至 2026-10-31 的 17 个与本仓库相关的会话（16 个 DSH、1 个 Codex），共约 2 万条原始记录；当次考古会话本身作为自审计对象排除。

和 [docs/pitfalls.md](../pitfalls.md) 的分工：pitfalls.md 是从旧仓库指南继承并增补的**规则清单**，一句话一条；本目录是**证据档案**，每条坑都带四段式过程和可回读的原始会话坐标，供人或 agent 在复现同类问题时定位上下文。两边编号独立，正文里会互相引用。

## 怎么读

- 先看下面自动索引里的「全部记录」，按严重度挑当前要处理的。
- 每条记录按四段读：**症状 → 诊断 → 方案取舍 → 结果与验证**。状态是 `resolved` 只覆盖当次实际验证过的范围；`partial`、`unresolved`、`hypothesis` 都按字面理解，不要当成已解决。
- 证据坐标里的行号是**脱敏导出 Markdown 的物理行号**（`.agent-sessions/dsh--*.md`、`.agent-sessions/codex--*.md`），不是原始 JSONL 行号；导出目录已在 `.gitignore` 中，不在仓库里。原始会话坐标另写在每条记录的 `source` 里。

## 证据与坐标

- 每条独立记录的原始摘录归档在 [evidence.gz](./evidence.gz)，用 `sarch evidence show --guide docs/avoiding-pitfalls-guide --id <ID>` 可以单条回读，不需要解压整个档案。
- 引用入口（`reference`）不重复存证据，指向被引用的独立记录。
- 摘录只保留与坑相关的 20–80 行，不存放整段会话。

## 维护方式

- 增量更新：重跑会话评审时先 `sarch --json guide inventory` 比对已有 ID 与来源，重复事实合并进原记录，新事实追加在对应章节末尾并沿用 `nextIds`。
- 章节文件按主题划分，编号连续、无空占位；新增主题时顺延文件名，并在仓库里修好指向旧文件名的链接。
- 每条记录的元数据行保持 `` `batch` `` / `` `severity` `` / `` `status` `` / `` `source` `` 四个标签不翻译；修改后跑 `sarch guide index` 重建索引，再跑 `sarch guide check` 校验证据覆盖率与体积预算。

<!-- BEGIN:auto-index -->
## 主题索引

| 主题 | 独立记录 | 引用入口 | 覆盖 |
| --- | --- | --- | --- |
| [验证与验收口径](./01-verification.md) | 7 | 0 | 交付时说“通过了”，不等于真的验证过；这一章收的是 dry-run 全绿、job 状态、typecheck 声明与测试夹具自己出错这几类假信号。 |
| [数据契约与口径](./02-data-contracts.md) | 6 | 0 | 同一个字段在不同来源、不同年份、不同 agent 手里会变成不同语义；这一章收的是数据转换与权限口径的漂移。 |
| [数据库与迁移](./03-database.md) | 6 | 0 | 生产库没有迁移历史表、pooler 要自签 CA、drizzle 不生成 REVOKE、Windows 的 psql 还有编码坑；这一章收数据库层反复出现的几个硬点。 |
| [认证与凭据](./04-auth.md) | 2 | 0 | 这一章只有两条：一条是身份模型错位（邮箱管理员 vs 手机号登录），一条是凭据怎么不落进对话。 |
| [部署与生产操作](./05-deploy.md) | 4 | 0 | 一次“上传代码”背后有 SSH 主机密钥、镜像仓库、Docker 构建上下文、ECS 运行时配置四层；这一章收这条链上真实断掉的点。 |
| [多 Agent 协作与工作流](./06-agent-workflow.md) | 6 | 0 | 并行 agent 不是为了更快地互相踩；这一章收的是共用工作区、提交纪律、需求边界和串行执行四类协作失败。 |
| [Windows 本地工具链](./07-tools.md) | 11 | 0 | 这台 Windows 机器上的 PowerShell 5.1/7、编码、Python、Postgres、安装脚本与退出码，构成了本仓库最高频的“假失败/假成功”来源。 |

**42 条独立记录，0 个去重引用入口，分为 7 个主题。**

## 全部记录

| ID | 坑点 | 主题 | 严重度 | 状态 |
| --- | --- | --- | --- | --- |
| [AGENT-01](./06-agent-workflow.md#agent-01) | 多个并行 agent 共用工作区：整包 typecheck 的失败不能默认归因自己 | 多 Agent 协作与工作流 | high | partial |
| [AGENT-02](./06-agent-workflow.md#agent-02) | 提交前不看 index：一次“上传代码”把本机技能 junction 展开成 1666 行提交进远端 | 多 Agent 协作与工作流 | critical | resolved |
| [AGENT-03](./06-agent-workflow.md#agent-03) | 「上传代码」30 分钟没有中间进度：用户等到爆粗 | 多 Agent 协作与工作流 | critical | partial |
| [AGENT-04](./06-agent-workflow.md#agent-04) | 把“上传课程”实现成只发视频，用户纠正才补试题与 OpenAPI/JSON Schema | 多 Agent 协作与工作流 | high | resolved |
| [AGENT-05](./06-agent-workflow.md#agent-05) | 重活先串行做、被用户催“多开几个 Agent”才并行 | 多 Agent 协作与工作流 | medium | resolved |
| [AGENT-06](./06-agent-workflow.md#agent-06) | 任务卡里的路径和假设要先复核，与文件正文冲突时以正文为准 | 多 Agent 协作与工作流 | low | resolved |
| [AUTH-01](./04-auth.md#auth-01) | 管理员用邮箱预建，站点只有手机号验证码登录：管理端登不进去 | 认证与凭据 | high | partial |
| [AUTH-02](./04-auth.md#auth-02) | 凭据不进对话：交互式配置 + 掩码输出；但脱敏脚本自身也会写错 | 认证与凭据 | medium | resolved |
| [DATA-01](./02-data-contracts.md#data-01) | 同一科目的卷型逐年在变，任务卡的统一结构是错的 | 数据契约与口径 | high | partial |
| [DATA-02](./02-data-contracts.md#data-02) | 同一份「答案」有两代结构；任务卡说的「双源对照」根本不含答案 | 数据契约与口径 | high | resolved |
| [DATA-03](./02-data-contracts.md#data-03) | 源数据本身有缺陷时，契约没有「表达缺陷」的位置 | 数据契约与口径 | high | unresolved |
| [DATA-04](./02-data-contracts.md#data-04) | 两个并行导入员对同一契约给出两种语义 | 数据契约与口径 | medium | unresolved |
| [DATA-05](./02-data-contracts.md#data-05) | 会员门口径从「两处」变「三处」，文档、验收表和前端代码各自漂移 | 数据契约与口径 | high | partial |
| [DATA-06](./02-data-contracts.md#data-06) | 派单消息与 spec 冲突时，三个 agent 各按文档实现并把冲突留给 Lead 拍板 | 数据契约与口径 | medium | partial |
| [DB-01](./03-database.md#db-01) | 原生 SQL 的 timestamptz 返回字符串，发布接口 500 | 数据库与迁移 | high | resolved |
| [DB-02](./03-database.md#db-02) | 生产库落后 8 个迁移，而且没有迁移历史表 | 数据库与迁移 | high | resolved |
| [DB-03](./03-database.md#db-03) | Supabase pooler：自签 Root 2021 CA，且必须先发 PostgreSQL SSLRequest 再升级 TLS | 数据库与迁移 | high | resolved |
| [DB-04](./03-database.md#db-04) | drizzle-kit 生成的迁移不含 REVOKE，新表默认对 PUBLIC 开放 | 数据库与迁移 | high | resolved |
| [DB-05](./03-database.md#db-05) | Windows 临时库的 psql：中文参数报 invalid byte sequence；DROP DATABASE 混在事务里失败留脏库 | 数据库与迁移 | medium | resolved |
| [DB-06](./03-database.md#db-06) | reviewer 外键与「已审核必有审核人」check 冲突 | 数据库与迁移 | medium | resolved |
| [DEPLOY-01](./05-deploy.md#deploy-01) | 部署 workflow 硬性要求 `DEPLOY_KNOWN_HOSTS`，用户暴怒后才承认是自己加的 | 部署与生产操作 | high | resolved |
| [DEPLOY-02](./05-deploy.md#deploy-02) | 镜像仓库域名 NXDOMAIN：ACR 个人版实例已失效，改走 SSH 直传镜像 | 部署与生产操作 | high | resolved |
| [DEPLOY-03](./05-deploy.md#deploy-03) | `.dockerignore` 白名单漏了 `scripts/`、`skills/`，镜像内 postinstall 失败 | 部署与生产操作 | high | resolved |
| [DEPLOY-04](./05-deploy.md#deploy-04) | ECS 运行时 `.env` 缺生产短信配置，API 容器 restart loop，部署“成功”但登录不可用 | 部署与生产操作 | high | resolved |
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
| [VER-01](./01-verification.md#ver-01) | dry-run 全绿只证明契约合法，不证明内容正确 | 验证与验收口径 | high | partial |
| [VER-02](./01-verification.md#ver-02) | 后台 job 报 completed / exit 0，可能正是失败现场 | 验证与验收口径 | high | resolved |
| [VER-03](./01-verification.md#ver-03) | 集成测试自建 Nest 应用，合法 1 MB 请求被默认 100 kB 上限打成 500 | 验证与验收口径 | high | resolved |
| [VER-04](./01-verification.md#ver-04) | 「待 Lead 跑」不是验证：迁移重放拖到四小时后，第一次就 4 项红 | 验证与验收口径 | high | resolved |
| [VER-05](./01-verification.md#ver-05) | 测试夹具和断言自己会错：写死字节数、把合法输入当非法用例 | 验证与验收口径 | medium | resolved |
| [VER-06](./01-verification.md#ver-06) | 验收表写着 typecheck 全仓通过，HEAD 实际编译失败；静态审查不跑守卫 | 验证与验收口径 | high | resolved |
| [VER-07](./01-verification.md#ver-07) | 汇报里的汇总数字也要按全集计数：11 套含图写成 12 套 | 验证与验收口径 | medium | partial |

## 统计

- 独立记录：**42**；去重引用入口：**0**
- 批次：`2026-10-31`
- 严重度：critical 2 · high 22 · low 4 · medium 14
- 状态：partial 8 · resolved 32 · unresolved 2
- 带归档证据：42
<!-- END:auto-index -->

## 本批范围与状态

- **发现**：`sarch --json sessions scan` 找到与本仓库 cwd 相关的 17 个 DSH 会话 + 1 个 Codex 会话；本次考古会话（`session-fa6fc042…`）作为自审计对象排除。18 个导出文件均解析到 EOF（`read_to_eof: true`）。
- **语义评审（第一批）**：15 个会话已完成评审并写入本指南，共 42 条记录（7 个主题）；其中 3 条是 2026-10-31 第二批增量（`VER-07`、`TOOL-10`、`TOOL-11`，来自评审报告终版）。评审报告原件在 `.agent-sessions/review/`（本地私有目录，已 gitignore，不随仓库分发）。
- **未纳入本批**：`session-e9a3218d…`（ticket 15）与 `session-65bd944f…`（Git/部署）的评审报告已归档，按增量流程在下一批追加到对应主题末尾，不覆盖现有章节与 ID。
- **解析覆盖 ≠ 语义覆盖**：每份评审报告都记录了自己的 `read_ranges` / `unread_ranges` / `omissions`；超大会话与大量重复注入块存在未逐行通读的区间，结论以已读窗口的逐字证据为准。
- **`incomplete: true` 的含义**：扫描/导出以 exit 1 结束来自 DSH registry 与 cwd 发现的会话数差异（`dsh_expected=5`、`dsh_found=17`、`missing=[]`），不是会话缺失；详见 TOOL-07。

