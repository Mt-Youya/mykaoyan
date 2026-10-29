# 12: skill mykaoyan

**What to build:** 考生把本站的 skill 交给自己的 agent，agent 就能从考生的备考资料生成合法的进度文件、离线校验、再用 Agent 令牌上传。

**Blocked by:** 11（Agent 令牌）

> M2 交接：先读 [HANDOFF-M2.md](../HANDOFF-M2.md)（现状、顺序、决策点、外部阻塞）。

**Status:** ready-for-human（本地完成；线上验收待部署）

- [x] 按 agentskills.io 规范组织，用 skill-creator 检查
- [x] 包含进度文件说明、零依赖校验脚本、空白模板；校验脚本对公开契约 fixture 的结论与 schema 一致
- [x] 在一个全新的 agent 会话中，只凭 skill 说明生成一份合法进度文件并上传成功（记录过程）
- [x] 说明中不出现真实个人数据


## 实现与验收（2026-10-29）

- `skills/mykaoyan/SKILL.md`：从授权的学习记录生成进度文件、先下载再合并、整份替换提示、原样 ETag、curl 示例与 400/401/412/428 和写入结果未知的处理；不带入私有题目、答案或凭据。
- `references/progress-v1.md`：字段含义、事实依据与格式校验边界；`templates/progress.v1.json` 是虚构日期的合法空白文件。
- `validate.mjs`：Node 内置模块，离线读取随包公开 schema，不依赖仓库内部实现或第三方库。只实现当前契约使用的关键字，遇到未知约束直接失败，不静默跳过。
- 契约生成脚本同时输出网站和 skill 的 schema；CI 将两者纳入重新生成无差异检查，测试也比较两份产物。
- skill-creator `quick_validate.py` 通过；结构遵守 agentskills.io 规范（本机检查器不支持 compatibility 字段，运行要求已放正文）。

### 全新 agent 会话实测

在隔离临时 Postgres 中重放全部迁移，启动真实 NestJS API，以虚构账号创建一次性 Agent 令牌。独立 agent 未继承实现会话历史，只获 skill 路径、私有临时环境参数和以下虚构需求：2030-03-10 数学（二）实际学习 45 分钟，完成「复习虚构考点」，明日「继续虚构练习」，复盘「按计划学习」，未建备考档案，不生成无证据的考点记录。明确授权上传到该本地测试账号。

| 步骤 | 实际结果 |
| --- | --- |
| 阅读与生成 | 仅读取 skill 及随包资源；生成物写入独立临时目录，未修改仓库 |
| 下载 | GET 200，ETag `"revision-0"` |
| 合并与摘要 | 新增每日记录 1 条，修改 0、删除 0，其他集合保持原样 |
| 离线校验 | `node validate.mjs progress.json` 退出 0 |
| 上传 | PUT 200，ETag `"revision-1"`，服务端摘要仅新增 daily 1 条 |
| 读回 | GET 200，ETag `"revision-1"`，data 与上传预期完全一致，profile 为 null，考点记录 0 条 |

独立 agent 报告说明足以完成该场景，无需额外澄清。父会话另用同一真实本地 API 核对：缺少 If-Match 为 428、旧 ETag 为 412、缺少令牌为 401、非法文件为 400。实测未访问线上账号、短信或云资源。

### 自动验证

- `tests/contract/skill.test.mjs`：38 项通过，包括 20 个公开契约 fixture 与 AJV 结论一致、日期/枚举/分钟/整数边界、独立复制运行、非法 JSON 不泄露内容、参数退出码，以及未知 schema 约束拒绝。
- 变异检查：临时禁用科目代码字段名校验后测试变红，恢复后通过。
- 静态检查：`pnpm fmt`、`pnpm lint`、`pnpm typecheck` 全部通过，保留既有 lint 警告。
- 全量测试：`pnpm test` 共 623 项通过；`pnpm build` 通过（媒体 Worker 仅 dry-run，未部署）。
- code-review：以 HEAD 为基准，仅审查本轮 ticket 12 文件；Standards 与 Spec 两个独立 agent 均无发现。
- 浏览器实测、真机实测：跳过，本工单是 agent/命令行流程。
- 线上上传：未执行，生产部署与域名/API 可用性另行验收。
