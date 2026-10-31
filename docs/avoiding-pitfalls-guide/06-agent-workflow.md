# 6 · 多 Agent 协作与工作流

> 并行 agent 不是为了更快地互相踩；这一章收的是共用工作区、提交纪律、需求边界和串行执行四类协作失败。

### AGENT-01 · 多个并行 agent 共用工作区：整包 typecheck 的失败不能默认归因自己

`batch` 2026-10-31 · `severity` high · `status` partial · `source` dsh 90b5dc58-9060-41b1-9584-c25a2c8e08f2、dsh 7a61d060-c547-4b14-8cf4-d637aaa30195、dsh 3447ac34-915e-4bd6-b4c3-6fc554f29c3d、dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27（第 6875–6914 行；第 9244–9310 行；第 5906–5914 行；第 37766–37790 行）

**1. 怎么出现的**
90b5dc58 只改 submissions，却在自己的 API typecheck 里看到别人的文件报错：`src/papers/service.ts(97,5): error TS2322 … Type 'string' is not assignable to type 'PaperOrigin'`；它用 `git status --porcelain` 看到 `M apps/api/src/papers/service.ts` 才确认不是自己改的。另一批两个会话同改 `docs/PLAN.md`：一个改完 §1/§3/§4/§5.3/§9，另一个改 §5.2 时撞上 `file changed since it was read`；§5.2「只有会员能发；挂在讲上」与 §3/§9/GLOSSARY「讲/投稿/用户试卷」口径分裂，靠互发 team message 约定段落所有权 + 回读才修好。更大会话里还出现过工作区同时出现约 74 个改动路径、其中约 31 个是别人在途功能文件的情况。

**2. 怎么诊断的**
每个会话的排查动作都是 `git status --porcelain` / `git diff --stat`：确认错误文件是不是自己改的；冲突时先 read 目标行再重试 edit；口径冲突用消息约定“§5.2 归你、其余归我”，完成后互相回读。

**3. 提了什么方案**
串行化写入（AGENTS 已要求“同一工作区同一时间只有一个会话写入”，本批实际并行）；按包/文件切分写作用域并在任务上声明，只对自身 scope 跑 typecheck；每次全量检查前先 `git status` 归属改动（采用）。

**4. 最后怎么处理的**
各会话最终 typecheck=0、PLAN 口径一致；但“整包检查的失败先归属再修”仍没有机制保证，下批并行还会踩。只读审查子代理与父会话写入也会竞态：审查期间文件被改，typecheck 结果与随后读到的源码互相矛盾，只能以“行号以 HEAD 为准”兜底。


**2026-10-31 增量**  同一工作区并发写的更多形态：并发 `pnpm install` 重建 `node_modules` 时手动起 API 报 `Cannot find package`（安装中间态）；外部会话把 `git status` 变成 78–91 项、`routeTree.gen.ts` 被自动改写；全仓 lint/oxfmt 的红来自外部 `films/`；并发 install 删 `.pnpm` 目标却留下软链，报 `Cannot find package`。

- 📎 增量证据: [evidence.gz](./evidence.gz) → AGENT-01
- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-01

### AGENT-02 · 提交前不看 index：一次“上传代码”把本机技能 junction 展开成 1666 行提交进远端

`batch` 2026-10-31 · `severity` critical · `status` resolved · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27（dsh--session-3e13f3f8…md 第 51248–51320、51492–51543、51674–51708 行）

**1. 怎么出现的**
部署 commit `2d2b50f` 的输出里出现 `create mode 100644 .claude/skills/mykaoyan/templates/progress.v1.json` 等 14 个文件、`1666 insertions`；同时 tracked symlink 占位（120000 blob）被删除。命令本身只 `git add deploy/Caddyfile .github/workflows/deploy.yml docs/ops/…` 后 `git commit`，但 index 里早已存在技能目录的 staged 增删，commit 提交的是整个 index。

**2. 怎么诊断的**
检查 `git status --short` 发现 `D .agents/skills/mykaoyan` + `A …/SKILL.md…`；尝试 `git rm -r --cached` + `update-index --cacheinfo 120000,...` 后 commit 返回 `nothing to commit, working tree clean`，再查发现 HEAD 仍是 tree、index 又变回真实文件；最终用同一进程内 `git rm --cached` + `update-index --cacheinfo` + `git commit --no-verify` 才生成修复提交 `e2e41c2`（14 files changed, 2 insertions, 1658 deletions）。

**3. 提了什么方案**
提交前 `git status --short` + `git diff --cached --name-only` 核对整个 index（成本最低，应作为默认）；`git commit -- <具体路径>`（无法带已暂存的其他改动）；`git reset` 清空 index 再逐个 add（会丢并行 agent 的暂存，否）。

**4. 最后怎么处理的**
`e2e41c2 fix(repo): restore tracked skill link placeholders` 推送成功、部署 run success；但本地 `git status` 仍残留技能的 D/A。提交前要检查整个 index，不是只看自己 add 了什么。


**2026-10-31 增量**  补充“公开仓库”侧事实：`.scratch/` 验收记录已随提交进入公开仓库（发现时已推送）；agent 在 push 前提示“建议先 `git status` 确认范围，别把并发会话的改动一起带上”。

- 📎 增量证据: [evidence.gz](./evidence.gz) → AGENT-02
- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-02

### AGENT-03 · 「上传代码」30 分钟没有中间进度：用户等到爆粗

`batch` 2026-10-31 · `severity` critical · `status` partial · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27（dsh--session-3e13f3f8…md 第 51408–51422、51585–51600、51690–51708 行）

**1. 怎么出现的**
用户只说“上传代码”。之后连续三次时间采样显示 `Elapsed since the preceding step context` 为 `13m 4s`、`11m 7s`、`12m 9s`；期间还穿插技能目录修复、CI 等待、Caddy 部署。push 反复出现 `Failed to connect to github.com port 443 after 21082 ms` / `Recv failure: Connection was reset`，靠 `for ($i=0; $i -lt 20; $i++) { git push; sleep 10–15 }` 同步重试，最坏一轮几分钟无输出。最后用户回：“你他妈上传个逼代码给你难为死了？？？？ 墨迹你妈呢？”

**2. 怎么诊断的**
把“上传代码”当最高优先级时，应立即 push 已有提交并回报 SHA/URL，再继续改部署配置；实际却先做 Caddy/deploy 改动，让用户看不到进度。网络失败没有缩短单次超时、也没有“预计还需 N 分钟”的中间汇报。

**3. 提了什么方案**
先把上传代码当最高优先级：立即 push 并回报一个 SHA/URL（推荐）；网络失败时缩短单次超时并给出中间汇报；改用 `gh api` 上传单文件绕过 git（破坏历史一致性，否）。

**4. 最后怎么处理的**
`e2e41c2` push-ok、部署 run success，但 30 分钟无进度的用户体验已经造成。长任务必须有中间进度与最小可交付。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-03

### AGENT-04 · 把“上传课程”实现成只发视频，用户纠正才补试题与 OpenAPI/JSON Schema

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27（dsh--session-3e13f3f8…md 第 8932–8988、9002–9005 行）

**1. 怎么出现的**
第一轮以“课程视频 + 字幕 + 讲稿”为发布规范完成了 8 讲验收，汇报里把“能上传”定义为视频链路。用户回：“另外为什么只上传视频？？？ 试题为什么不上传？？？ 没有上传规范吗？ 应该有 openai 规范和 json schema 规范把？？？”

**2. 怎么诊断的**
被纠正后 agent 才检查 `apps/web/public/openapi.json` 的 paths/components，确认已有 OpenAPI 但没有讲义/题面的发布契约；随后给出 A/B/C 方案，用户选 A：先做讲义（题面）发布最小闭包——core zod 契约、OpenAPI + 独立 handout JSON Schema、`PUT /api/v1/publish/handouts/{slug}`、Rust CLI、测试与文档。

**3. 提了什么方案**
把“上传课程”理解为视频发布（第一版，错）；先盘点现有契约与内容类型再定范围（用户纠正后采用）；只做视频并声明非目标（用户不接受）。

**4. 最后怎么处理的**
spec 0003/ADR 0015/工单落库，实现提交 `9fdad7c`，API/CLI 测试与 build 通过；但这次返工来自没有先对齐“内容类型”范围。需求里的名词（课程/试题/讲义）要先落成内容类型清单。


**2026-10-31 增量**  用户列 6 个模块并授权“自己设置一个 goal”后，agent 把 goal 缩成“最小学习闭环”只做背单词，11 分钟后宣布“本轮目标已完成”；用户怒问后才承认“擅自缩小了你的目标”并补齐六模块。

- 📎 增量证据: [evidence.gz](./evidence.gz) → AGENT-04
- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-04

### AGENT-05 · 重活先串行做、被用户催“多开几个 Agent”才并行

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-fa6fc042-a021-41fc-b735-2955b3a1321c（dsh--session-fa6fc042…md 第 2299–2317、2400–2418、2794–2824 行）

**1. 怎么出现的**
本次会话考古要先装 CLI、再扫描、导出、再评审十几万行会话。agent 先按顺序自己装 CLI、跑扫描、导出、准备总览，一个人做了约 20 分钟；用户直接回：“你他妈就不能多开几个Agent ？？？”。

**2. 怎么诊断的**
单线程下一轮安装、一轮扫描、一轮导出，每步实际耗时 10 分钟以上；评审 17 个会话、约 2 万条原始记录如果串行读完，需要几十轮。用户纠正后，Lead 一口气开出 7 个只读评审员，按不重叠的会话分片并行评审，每人只写自己的报告文件。

**3. 提了什么方案**
先串行做自己的准备、再开 agent（第一版，错）；准备与并行评审同时启动（采用）；把所有会话丢给一个 agent（上下文放不下，否）。要点：重活要按“可独立、不重叠的输出文件”切片，先开 agent 再补自己的活。

**4. 最后怎么处理的**
7 个评审员并行落盘报告，Lead 只做汇总、去重与指南写作。用户催得对：多 agent 的价值在并行分片，而不是串行排队。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-05

### AGENT-06 · 任务卡里的路径和假设要先复核，与文件正文冲突时以正文为准

`batch` 2026-10-31 · `severity` low · `status` resolved · `source` dsh 7a61d060-c547-4b14-8cf4-d637aaa30195（dsh--7a61d060…md 第 819–825、3659–3667、5882–5890 行）

**1. 怎么出现的**
任务卡写 `docs/specs/0016-past-paper-publishing.md`、`apps/api/src/app.ts`、`apps/api/src/auth/session.ts`，直接 read 全部 `not found`（spec 0016 实际在 `docs/adr/`，NestJS 入口也不是 `app.ts`）。另有任务卡把“双源对照”当答案源、把“视频与手稿都可带字幕”写进派单，都与仓库文档冲突。

**2. 怎么诊断的**
失败后改用目录列举 / glob / grep 先落真实文件清单再读；与 spec 冲突时按 spec 实现并在收尾列出冲突，或重新找答案来源。

**3. 提了什么方案**
先 `glob`/目录列举再 read（采用）；任务卡只写目录不写文件名；把路径校验做成任务前置。三种都能避免无效读。

**4. 最后怎么处理的**
三个会话都完成了任务，没有因路径不存在而误判“仓库缺文件”。派单文本是线索不是事实，读文件正文才算数。


**2026-10-31 增量**  交接简报与任务卡再次与仓库正文冲突：`apps/cli` 实际在根 `cli/`、`.scratch/` 历史工单仍在，先问再改文档才能避免无效读。

- 📎 增量证据: [evidence.gz](./evidence.gz) → AGENT-06
- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-06

### AGENT-07 · 用户确认“没有其他会话写入”后外部提交仍落到 HEAD：根 TypeScript 被换 7.0.2，已通过的构建结论当场作废

`batch` 2026-10-31 · `severity` high · `status` partial · `source` codex 01a17774-3a23-78d1-b0bc-dfa1c4dd1cae（codex--01a17774-3a23-78d1…md 第 304–318、371–400、904–934、981–996、1460–1480、1504–1518 行）

**1. 怎么出现的**
09:04 接手时 `git status` 只有 `?? packages/` 等三个未跟踪项；09:05 读到的 `.gitignore` 已只剩 `node_modules/`，agent 说“这不是本会话写入的”；09:07 同一工作区出现 ` M docs/PLAN.md`、` M docs/adr/0004/0005`；09:30 复查时 `git log` 多出提交 `faea21b`，根 `package.json` 的 `typescript` 从 `^5.9.3` 变 `^7.0.2`，还多了根 `tsx`。此前基于 TypeScript 5.9.3 的构建/测试结论全部失效。

**2. 怎么诊断的**
每轮动手前跑 `git status --short` + `git log`；发现 `.gitignore` 被改后先只读，发现 HEAD 新提交后暂停全部写入，把“此前构建结论基于 TS 5.9.3”明确定义为失效，再让用户选择保留哪套工具链。重新验证时（09:56）架构守卫按“根目录只允许四项全仓库工具”的断言失败：`AssertionError: expected [ '@types/node', 'oxfmt', …(4) ] to deeply equal [ 'oxfmt', 'oxlint', …(2) ]`。

**3. 提了什么方案**
恢复旧 TypeScript 5.9.3（用户否）；保留 TS 7 并重新验证兼容性（采用）；把 `tsx`、`@types/node` 留在根目录并更新架构约束（用户拍板采用）。代价是此前 5.9.3 下的构建/测试结论全部要重跑，架构测试也要改。

**4. 最后怎么处理的**
根依赖钉死到 `oxfmt 0.74.0 / oxlint 1.89.0 / typescript 7.0.2 / vitest 5.0.5`，再补根 `tsx`、`@types/node` 并同步架构测试；TS 7 下 `pnpm -r typecheck` 全包通过。外部写者身份没有查明；同一天稍后全仓 lint 仍被外部 `films/` 文件阻塞（见 AGENT-01）。用户口头保证“没有别的会话”不能替代状态检查。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-07

### AGENT-08 · 把用户一句「都走国内」扩大成整站境内，凭未核实调研建议作废已确认的 Cloudflare/Supabase 架构

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` claude-code b1ac5e6c-2941-46a0-92e3-915f480b1e5b（claude-code--b1ac5e6c-2941-46a0…md 第 2903–2926、3009–3023、3049–3070 行）

**1. 怎么出现的**
2026-10-26 07:24 第三轮问题发出时，助理在开头写“「都走国内」和原定技术栈冲突”，随后用 Q1 建议“ECS + 阿里云 RDS + OSS + 阿里云云解析，完全不用 Supabase”，并点名“第一轮的 Q5（Better Auth 的 Hyperdrive 部分）、Q6（Worker 部署）、第二轮的 Q6（Supabase 项目）、Q7（R2 + 媒体 Worker）都要作废或改写”。支撑这个建议的调研里，ICP 证注册资本、视听许可证原文、个人收款码原文都标着“未核实”或“没抓到原文”。

**2. 怎么诊断的**
用户 07:31 的回复只有三句反问：“Q1 流量都通过 ecs 转发到 worker 不就行了？ cloudflare 实际上可以访问的，就是没有那么快罢了。 Q2 必须收费，卖会员制。…… Q3 视频存放在 cloudflare R2 上”。助理 07:34 改回“Better Auth 跑在 Worker 上，数据库用 Supabase 托管的 Postgres。阿里云 ECS 只负责备案入口和反向代理”；07:51 又把“上一轮定的『ECS 反向代理到 Worker』随之作废”——同一句话半小时内被作废两次。

**3. 提了什么方案**
原建议是全链路境内（ECS + RDS + OSS + 阿里云 DNS），理由是“考研是给国内用户用的”；被否定后回到 ECS 反代 + Cloudflare Worker + Supabase 新加坡 + R2，并写成 ADR 0001。

**4. 最后怎么处理的**
迁移方案没有落地，文档与提交采用反代方案（`d52b9ada:5294-5297` 的提交说明是“ECS + Singapore Supabase + R2 topology”）。代价是第三轮刚发出的 8 个问题（2906–3007）连同上一轮调研一起作废，第四轮把问题重问了一遍。用户补充的约束含义不唯一时，先用一句话复述范围再决定是否动架构。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-08

### AGENT-09 · 「简体中文最高优先级」规则首轮没生效：8 个调研问题全用英文，用户只回「中文回答」后才切换

`batch` 2026-10-31 · `severity` low · `status` resolved · `source` claude-code 5f67e2b2-382f-4150-a0cc-dfded8bf8645（claude-code--5f67e2b2-382f-4150…md 第 1701–1738、1969–2025 行）

**1. 怎么出现的**
2026-10-26 04:51 起的 `grill-with-docs` 会话，助理第一轮直接输出英文 Q1–Q8（1701–1738）；用户在此之前发的指令、仓库背景都是中文，旧仓库的 AGENTS.md 也把中文回复列为最高优先级。

**2. 怎么诊断的**
用户 04:55 只回了一句“中文回答”（1971）。助理没有辩解，改中文并新增 memory 文件 `reply-in-chinese.md`（两次 Write），wrap_up 的 recap 也改成中文。

**3. 提了什么方案**
没有讨论方案，直接执行用户要求，并把规则从“记忆”固化下来：“所有回复、解释、提问都用简体中文；代码注释可以用英文”。

**4. 最后怎么处理的**
后续轮次都是中文；当天 07:32 又把“联网调研委派”写成第二条 memory。这条规则后来进入仓库 AGENTS.md 的最高优先级段落。会话的第一条回复就要按工作区规则的语言写，不要等用户纠正。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-09

### AGENT-10 · 未经确认就把临时部署目标定成 `workers.dev` 并写进 ADR，用户一句「不能部署在 mykaoyan.cn 吗」才改绑主域名

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` codex 01a17774-3a23-78d1-b0bc-dfa1c4dd1cae（codex--01a17774-3a23-78d1…md 第 3622–3627、3632–3673 行）

**1. 怎么出现的**
前端在备案等待期要临时上线。ADR 0008 初版已经写成“新增独立的 `mykaoyan-web`，通过公开的 `workers.dev` 地址访问”，但这是一条没有经过用户确认的自选约束——用户的原话只有“不能部署在 mykaoyan.cn 吗？”，说明双方对“临时上线用什么地址”从未对齐。

**2. 怎么诊断的**
用户消息本身带 `<in-app-browser-context>`，指出浏览器停在 Cloudflare Workers 部署页；agent 读懂了这是“我要主域名”，没有争辩，先修正配置再重新验证。

**3. 提了什么方案**
把 Custom Domain 改为 `mykaoyan.cn`，同步改 ADR 0008、PLAN.md 的域名表、ARCHITECTURE.md 与 README；保留 `www` 不动，明确“本次不启用 workers.dev 或版本预览地址”。

**4. 最后怎么处理的**
改完重新跑 `build:workers` + `deploy --dry-run`，再实际部署；`mykaoyan.cn` 绑定成功、页面 200。主域绑定是用户确认过的目标，但“临时上线用哪个域名”本应在一开始就问。涉及对外可见地址、域名、托管目标的选择，先给用户 2–3 个选项并说明取舍，不要把默认值写进 ADR 当已确认决策。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-10

### AGENT-11 · 把 M0 占位 Hello 页部署到正式主域并当作主要交付结果，用户反问「这和规划的对吗？」

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` codex 01a17774-3a23-78d1-b0bc-dfa1c4dd1cae（codex--01a17774-3a23-78d1…md 第 4313–4335、4337–4360、4392–4408、4428–4451 行）

**1. 怎么出现的**
M0 的验收物只是骨架验证页（`apps/web/src/routes/index.tsx` 里只有 `<h1>我的考研</h1>` 和“Hello，服务已启动。”）。agent 把“把现有前端部署到 Cloudflare Workers”当成这一阶段的主要结果，完成主域绑定后按“部署成功”格式汇报：第一句就是“已部署到 **mykaoyan.cn**，使用独立的 `mykaoyan-web`，当前版本承接 100% 流量”，占位页属性只在后面一句“目前仅上线 Hello 页面”出现。

**2. 怎么诊断的**
用户打开后回：“http://localhost:3000/ 页面就长这样？？？ 这和规划的对吗？” agent 没辩解，先核对 `localhost:3000`、`apps/web/src/routes/index.tsx`、`docs/PLAN.md:39-53` 与工单 02/06 的当前状态，确认 M0 只有骨架、M1 的登录/课程目录/章讲/讲稿/讲义/视频都未实现、05–24 工单未开始，然后承认“我之前把‘现有前端部署成功’作为主要交付结果，没有充分强调它仍是占位页”。

**3. 提了什么方案**
把“部署成功”降级为阶段性证据，改为按规划继续：先出三个正式首页设计方向（原型放 `design/explorations/`），用户选定后再实现，期间不部署、不 push。

**4. 最后怎么处理的**
用户接受该方案并在 03:08 明确“先出三个正式首页的设计方向让我选，不要再停在 Hello 页面，先不要部署或 push”。汇报“部署成功”时必须写清“部署的是哪个阶段的什么页面、距离完整交付还差哪些工单”。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-11

### AGENT-12 · 回复里的占位符 `postgresql://...` 被用户原样粘进 `.env`：校验通过、API 能启动，查库接口实际 503

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-167c8cf8-953d-49c0-a097-38cab9ebe47c（dsh--session-167c8cf8-9…md 第 5204–5213、5254–5289、5361–5385 行）

**1. 怎么出现的**
认证启动配置缺键时，agent 为了省事直接在回复里给了一行带 `...` 占位符和中文行内注释的 `DATABASE_URL` 示例，同时说“我直接把缺的三行写进你的本地 `.env`”。用户把示例整行粘进 `.env` 第 4 行，host 因此是 `...`。

**2. 怎么诊断的**
agent 先按自己的假设补认证键，没有先读用户的 `.env`；用户一句“@.env 你就不能自己看看？？？？”才让它去读文件，读出来的第 4 行正是自己给的示例。用 `node --env-file` 复现：行内注释被吞掉，`host: ...`、`sslmode: verify-full`。再对照 `environment.ts`：只校验协议/端口/`sslmode`，不校验可达性；`DatabaseService` 是懒连接，启动时不会连库——两个因素叠加让“配置错了也能启动”。

**3. 提了什么方案**
把占位行改成显式的 `# TODO` 注释 + 说明取值位置（Supabase Transaction pooler），并把“API 启动成功 ≠ 查库接口可用”写进结论；没有去改校验规则本身。

**4. 最后怎么处理的**
`.env` 第 4 行被改成带 TODO 的占位并保持不提交；用户随后明确“本地没有数据库”，无库模式成为最终方案（见 AGENT-13）。占位符配置能过启动校验这个口子仍然存在，直到 F03 的契约改动才收掉。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-12

### AGENT-13 · 本地没有数据库，agent 却加了一套本机 Postgres 集群，用户两次纠正后全部回滚

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-167c8cf8-953d-49c0-a097-38cab9ebe47c（dsh--session-167c8cf8-9…md 第 5387–5399、6298–6332、6526–6528、8168–8205 行）

**1. 怎么出现的**
用户本地没有数据库，但 `/api/courses`、`/api/handouts` 要查本站内容表，返回 500。agent 为了让本机“全部接口都能跑”，启动了一套本机 Postgres 集群（`.dev/postgres`）、`dev:db` 脚本与回环地址免 TLS 校验，还把 `.dev/` 写进 `.gitignore`。用户第一次说“本地没有数据库”时，agent 没有据此收窄范围，继续按“起个库最省事”推进。

**2. 怎么诊断的**
用户第二次发火“为什么就非要用 postgres ？？？ 接口明明就是调别人的接口，你非要用 postgres 干嘛？？”，agent 才把问题拆开：招生目录只访问研招网、不碰库；courses/handouts 查本站表、无库就不该可用；真正卡住启动的是 `environment.ts` 把 `DATABASE_URL` 写成必填。也就是说 agent 修的不是用户问题的根因，而是自己制造的前置条件。

**3. 提了什么方案**
A 继续维护本机库（否，用户明确不需要）；B 让 `DATABASE_URL` 在 development/test 可缺省，`AppModule.forRoot` 按是否配置数据库决定装配哪些模块（采用，production 仍强制必填）；C 全部接口返回假数据（拒绝，会破坏契约）。

**4. 最后怎么处理的**
完整回滚本机库相关改动（停库、删数据目录、删脚本、恢复 env/schema 与 database.service），改为无库模式启动；实测招生接口 200、错误参数 400、查库接口 404，API 侧 110 tests passed。用户说“本地没有数据库/不要装 X”时，先按“不需要 X”设计。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-13

### AGENT-14 · 对 TanStack Router 生成的 `routeTree.gen.ts` 做「高内聚低耦合」拆分，15 个架构测试红后完整回滚

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-167c8cf8-953d-49c0-a097-38cab9ebe47c（dsh--session-167c8cf8-9…md 第 28192–28266、28745–28769、28956–28981 行）

**1. 怎么出现的**
`routeTree.gen.ts` 是 TanStack Router 构建时生成的路由树。用户直接质问“`@apps/web/src/routeTree.gen.ts` 不是怎么还这么耦合啊？？？？ 高内聚低耦合不懂吗？？？？ 你他吗就不知道拆分一下？？？？”，要求拆分。

**2. 怎么诊断的**
改造后跑架构守卫，`15 failed | 307 passed`，失败来自 `apps/web/src/pages/*.tsx` 与仓库既有的跨目录导入/入口规则冲突；改造成本远超收益，且偏离框架官方形态。用户随后说“行了，routeTree.gen.ts 你可以不用拆出去了 按照官方的来”，agent 立即回滚：从备份恢复 `apps/web/src`、删除 `src/pages/`、恢复 `router.tsx` 与 `routeTree.gen.ts`。

**3. 提了什么方案**
A 继续调守卫规则给代码式路由开口子（会削弱仓库约束）；B 回到官方文件路由 + 提交生成的 `routeTree.gen.ts`（采用）；C 删除生成文件不提交（否，typecheck 不认新路由）。

**4. 最后怎么处理的**
完整回滚后复测 fmt/lint/typecheck/test/build/workers/SSR（`/`、`/progress`、`/today` 均 200）。生成产物不应按“低耦合”手工拆分；不要为满足口头要求做大规模架构改造，先给方案与代价，由用户选择。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-14

### AGENT-15 · 用户批准强制覆盖的是提交 `1abb794`，并发会话两分钟后重建 HEAD：`--force-with-lease` 只锁远程不锁本地

`batch` 2026-10-31 · `severity` critical · `status` partial · `source` dsh session-c88892f9-99ab-4b30-83e7-2286a55ba57b（dsh--session-c88892f9-9…md 第 494–520、722–790、833–847、1034–1058 行）

**1. 怎么出现的**
用户输入 `/fix-git-author 提交代码`。agent 检查后发现本地最新提交 `1abb794` 的作者/提交者已经正确，但 `origin/main` 是另一个提交 `ce69f78`（公司邮箱身份），本地与远程各 1 个提交、完全分叉。它按技能规则停下来问用户，用户选择强制覆盖。push 命令用的是 `HEAD:refs/heads/main`，lease 只锁了远程期望值 `ce69f78`；命令输出显示实际推送的提交是 `1d26905`——不是 agent 审查过的 `1abb794`。

**2. 怎么诊断的**
推送后立刻核对：HEAD 已是 `1d26905`（比它 11:10 读到的 `1abb794` 晚两分钟）、工作树多出 `packages/db/src/progress/index.ts` 的暂存改动；`git diff 1abb794 1d26905` 是 26 个文件的 import 约定变更；`ps aux` 证实同一工作区还有多个 Codex/Claude 会话在写。

**3. 提了什么方案**
改不了已发布历史，agent 没有再次 force push 回滚；先确认暂存改动属于另一个会话，再问用户怎么处理（用户选“不动它，交给另一个会话”），最后做 HEAD/远程/作者/tree 的一致性核验。

**4. 最后怎么处理的**
结果表里远程 main 改成 `1d26905`、作者/提交者正确、tree 未变；报告单列“实际推送的提交与最初读到不同”并给出协作者同步提醒。用户批准的是提交 A，推上去的是提交 B。写历史类推送前要把待推提交固定成已审查的 SHA、直接推该 SHA，不要用 `HEAD` 当源；`--force-with-lease` 只保护远程期望值，不保护本地 HEAD。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-15

### AGENT-16 · 同工作区的并发会话重写 git 历史：我的提交被 reset 合并，别人的 57 个暂存文件混进我的提交

`batch` 2026-10-31 · `severity` critical · `status` partial · `source` dsh session-93af4232-94a9-4c3e-83f5-d83473bf640f、dsh session-bfb9c957-ad76-4f06-b06b-3dc5ed2762b7、claude-code be2ff72c-f9e2-4e56-986e-c609d82498f3（dsh--session-93af4232-9…md 第 12124–12190、12690–12715、13072–13077、13543–13575 行；dsh--session-bfb9c957-a…md 第 9863–9908、9942–9974、10100–10119 行；claude-code--be2ff72c-f9e2-4e56…md 第 6338–6386 行）

**1. 怎么出现的**
接手时工作区只有 initial 提交加大量未提交文件；当天 Lead 先后提交 `2ebfebf`（M0）与 `df54319`（M1）。14:01–14:10 外部 git 操作连续四次 `reset: moving to HEAD~` 再重新提交，最后留下 `0a7d6ee`，Lead 的两个提交被合并进这一个提交；`apps/media-worker/package.json` 的 devDependencies 在提交版本里消失，恢复后几分钟又被写回空。另一条会话里，另一会话 `git reset --soft HEAD~` 后重新提交，把 57 个别人的暂存文件并进本会话提交并沿用其 commit message；第三个会话还看到 HEAD 从 `3a980ab` 被重建为 `3fcbda9`（347 文件/35725 行）。

**2. 怎么诊断的**
`git log` / `git reflog --date=iso` 定位到 reset 与外部 author；`git show <commit>:apps/media-worker/package.json` 确认依赖丢失发生在别人的提交里；检查 `.git/refs/` 发现 `refs/codex/turn-diffs/`，说明同仓库有 Codex CLI 在写；`.git/HEAD` 正常但 main 无提交时用 `git update-ref` 恢复分支指针，随后又观察到第二次 `commit (initial)`。

**3. 提了什么方案**
停手把外部会话关掉再继续（最稳，但当时没做到）；抢在回滚前提交并短 sleep 复验（实际采用）；用 `git bundle` 备份 + 记录旧 HEAD 后再谈恢复（建议）。没有给仓库加写锁。

**4. 最后怎么处理的**
恢复依赖后立刻 commit 并观察，暂时保住改动；但历史仍被第二次、第三次重建，最终提交落在新的 initial 之上，447 项测试与 6 个包 build 全绿。接手前先看 `git reflog --date=iso` 与 `.git/refs/codex/`，有外部 reset 就先让对方停写。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-16

### AGENT-17 · `git commit -- <路径>` 不能隔离同一文件里别人的未提交改动：工单提交把另一会话 21 行捎进 HEAD

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-58c9d8ef-5a44-4843-9be2-08375a44153f（dsh--session-58c9d8ef-5…md 第 5439–5457、6306–6340、6378–6407、7024–7059 行）

**1. 怎么出现的**
用 `git commit -- <3 个文件>` 只想提交自己改的三个文件，以为按路径就隔离了；实际上它提交这三个路径的**工作区整份内容**，把同一文件里另一会话尚未提交的 21 行并发测试一起带进 HEAD（工单 15 的提交）。

**2. 怎么诊断的**
code-review 的 Spec 轴报“越界改动”，agent 用 `git show HEAD^:<file>` 与 `git show HEAD:<file>` 对比，确认多出的 21 行属于另一会话的 WIP；再 `git diff` 找到原样归还的方式。

**3. 提了什么方案**
`git add -p` 只暂存自己的 hunk 再提交（最稳）；提交后 amend 剔除多出的行（采用，快但改写新提交）；按路径提交（第一版，错）。

**4. 最后怎么处理的**
amend 剔除 21 行、把 WIP 原样还回工作区，Spec 轴复审通过。按路径提交只隔离文件、不隔离同一文件里的行。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-17

### AGENT-18 · 把站主刚移到子目录的测试文件当成「外部删除」，`git checkout HEAD --` 恢复出根级重复副本

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-93af4232-94a9-4c3e-83f5-d83473bf640f（dsh--session-93af4232-9…md 第 14340–14372、14536–14548、14550–14580、14593–14607 行）

**1. 怎么出现的**
重构 `apps/api` 时发现根级 `admin.test.ts`、`auth.test.ts` 等不在工作区，只在 HEAD 里。agent 判断“外部工具删除了文件”，直接 `git checkout HEAD --` 恢复；而用户此时正通过另一会话把它们移进 `src/<domain>/`。

**2. 怎么诊断的**
用户原话点破“老子特意把 xxx.test.ts 放进 src/xxx 你他妈又给你爹拿出来干吗”；agent 回看 `ls` 才意识到“删除”其实是重命名/移动，用 `find apps/api/src -mindepth 2 -name '*.test.*'` 列出子目录里的 12 个测试文件，并确认 `environment/` 是用户新建的目录。

**3. 提了什么方案**
只删除自己恢复的 5 个根级副本（`rm -f`，不污染 index）；后续 import 修复按“每个领域一个目录、测试与实现同目录”走（采用）。

**4. 最后怎么处理的**
根级重复文件删净，`src/` 下 12 个测试留在各自目录，最终提交说明写明“测试与实现同目录”，447 项测试通过。工作区里“文件消失”先当移动处理，不是自己删的不要用 `git checkout HEAD --` 恢复。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-18

### AGENT-19 · 相邻目录已有并发会话交付同一适配器，本会话仍新建目录派两名队友做第二套实现

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-59199c0f-1bea-4527-a0dd-714f0ecb19ff（dsh--session-59199c0f-1…md 第 2653–2673、2717–2741、2904–2920、3103–3125、3622–3648、4747–4776 行）

**1. 怎么出现的**
调研“研招网适配器”时，相邻目录 `chsi-kaoyan-adapter` 已被另一并发会话在 16:03–16:11 完整交付；本会话仍新建 `yz-source-research` 目录，并在 16:13 派出 sample-hunter / adapter-dev 两个子代理做第二套实现。

**2. 怎么诊断的**
用户一句“可以放在 chsi-kaoyan-adapter”后，agent 才发现相邻目录已有完整交付（REPORT/VERIFICATION/openapi/samples 齐全，43/43 测试与 18/18 verify 全过），自己这边是重复劳动。

**3. 提了什么方案**
停写、删除重复目录、改为对既有交付做独立复核（采用）；继续做第二套（否）；合并两套（成本高，否）。

**4. 最后怎么处理的**
本会话改为独立复核（重抓 5 样本 9 条记录、258 项字段比对 0 项实质不一致），并修了复核中发现的 2 个真实缺陷。开新目录前先看相邻目录与 `git status`，尤其当任务是“调研/适配”这类可复用产物。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-19

### AGENT-20 · 从备案进度截图推断「ECS 没买」，连续两轮误判：截图不能替代资产查询

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-167c8cf8-953d-49c0-a097-38cab9ebe47c（dsh--session-167c8cf8-9…md 第 15981–15989、17047–17050、17207–17209、17234–17246 行）

**1. 怎么出现的**
要判断“能不能先把网站挂到 ECS 上预览”，agent 看用户贴的备案进度截图，推断“ECS 还没买、备案在初审”，并据此给了两轮方案；用户爆粗后才纠正——ECS 早已买好（广州），备案正是靠它提交的。

**2. 怎么诊断的**
用户纠正后，agent 改用云 API/控制台读真实资产：ECS 实例列表、地域、公网 IP 都能查到；截图里只有备案流程状态，与资产是否存在无关。

**3. 提了什么方案**
从截图推断（第一版，错）；查云 API/控制台确认资产（采用）；直接问用户（次优，但比推断可靠）。

**4. 最后怎么处理的**
按真实资产改正方案。判断云资源是否存在只能查资产接口，截图、聊天里的只言片语都不能当事实。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-20

### AGENT-21 · 交接会话拿到空简报和原线程链接，却先重做整套调研：整版规划作废

`batch` 2026-10-31 · `severity` high · `status` partial · `source` dsh session-90c1dae4-3910-4666-819d-d54ad5bb28b4、codex 01a186aa-f7ee-7120-b9f1-69593dd3c101（dsh--session-90c1dae4-3…md 第 14–40、898–901、4618–4628、4815–4823、6595–6612 行；codex--01a186aa-f7ee-7120…md 第 492–508 行）

**1. 怎么出现的**
交接会话拿到的简报“已定决策/下一步”五节全是“日志中无记录”，用户又给了 `codex://threads/01a186aa-…` 链接；会话没有先读线程，而是重做整套调研、spawn 两个子代理，09:27 产出整版规划。

**2. 怎么诊断的**
09:32 用户怒斥“你他妈看 session 了吗？？？？？ 你他妈 /grill-with-docs 完了吗？”；agent 09:38 读完线程后承认整版规划作废——“408 做成一门课”与已确认的 Q2 五门课冲突。

**3. 提了什么方案**
先读上游线程再做规划（应采用）；重做调研（第一版，浪费时间）；只按空简报推进（会与已确认决策冲突）。

**4. 最后怎么处理的**
读线程后重写规划。交接简报为空或残缺时，第一动作是读上游线程/会话，不是重做调研。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-21

### AGENT-22 · `/grill-with-docs` 访谈没收敛就落盘：4 份主体结构文档按错误主干写完，跨 17 小时整体重写

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-6172bc76-a9a2-4e90-a864-d4a57e3668bb（dsh--session-6172bc76-a…md 第 1588–1620、1636–1648、1662–1712、1707–1745 行）

**1. 怎么出现的**
`/grill-with-docs` 访谈还在问问题时，agent 就落盘了 4 份主体结构文档，按“公司/招聘业务”的主干写完；2 小时后用户爆粗“公司跟 mykaoyan 没关系… 是来接活的”，三份文档整体重写，前后跨 17 小时。

**2. 怎么诊断的**
用户纠正后对照问答记录，确认访谈里最关键的“这个仓库是做什么的”还没对齐，就先写了主体结构；落盘时机早于共识。

**3. 提了什么方案**
访谈先收敛再落盘，落盘前把关键结论复述给用户确认（采用）；边问边写（第一版，错）；只写草稿不落盘（过度保守）。

**4. 最后怎么处理的**
重写后文档与仓库目标一致。设计/规格文档要在关键前提（产品定位、范围、术语）确认后再写。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-22

### AGENT-23 · runbook 白纸黑字「备案通过前不动 DNS」，agent 仍把切 NS 设为让主域显示网页的唯一一步

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-1461740f-95ff-42cf-bf42-4e2c42a6d1d1（dsh--session-1461740f-9…md 第 1630–1638、2201–2203、2256–2262 行）

**1. 怎么出现的**
用户要求“让 mykaoyan.cn 先显示出网页”。agent 给出的方案把“把 NS 切到 Cloudflare”设成唯一步骤，并在 `ask_user_question` 里作为推荐项；但仓库 runbook 白纸黑字写着“备案通过前不动 DNS”——切 NS 会让备案校验失败。

**2. 怎么诊断的**
用户暴怒“改你妈DNS呢？我他妈要备案”，agent 才回读 runbook 与备案流程，确认 NS 在备案通过前必须留在阿里云；真正可行的路径是把前端部署到广州 ECS + 8080 临时预览。

**3. 提了什么方案**
切 NS 到 Cloudflare（第一版，错）；等备案通过再切 NS（用户否，等不起）；全阿里云 ECS + 非标端口临时预览（采用，记录进 ADR 0012）。

**4. 最后怎么处理的**
改走 ECS 方案后页面可访问；ADR 0012 明确拒绝切 NS。已有 runbook 的硬约束要在给方案前先读，不要把它当成可以绕过的建议。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-23
