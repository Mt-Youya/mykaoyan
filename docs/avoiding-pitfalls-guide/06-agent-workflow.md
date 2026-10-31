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

- 📎 excerpt: [evidence.gz](./evidence.gz) → AGENT-06
