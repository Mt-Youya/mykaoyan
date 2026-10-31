# 29: 用户内容契约与校验（手稿、字幕、用户试卷、审核请求）

**What to build:** 在 `packages/core` 增加用户上传所需的 zod 契约与常量：投稿 `kind`、手稿输入、字幕轨道与整体替换、用户试卷提交、试卷审核请求与结果；所有规则与 Web/API 共用，不新增公开 OpenAPI/JSON Schema 产物。

**Blocked by:** 22、26（现有契约与校验先例）

**Status:** ready-for-agent

**Spec:** [规划 0005](../../../docs/specs/0005-user-uploads.md)｜**ADR:** [0017](../../../docs/adr/0017-user-content-uploads.md)

- [ ] `SUBMISSION_KINDS` 与常量：手稿字符上限 1,000,000、字节上限 1,048,576；字幕单条字节上限 262,144、每投稿 2 条；用户试卷题数上限 50、整卷题面+答案+解析字节上限 512 KiB
- [ ] `manuscriptSubmissionInputSchema`：`id`（客户端 UUID 幂等）、`kind='manuscript'`、标题 1–200、简介 ≤ 2000、三位科目、可空考点（属于所选科目）、`manuscriptMarkdown` 1–1,000,000 字符（拒绝 NUL、非 UTF-8 由服务端另行校验）
- [ ] `submissionSubtitleTrackSchema` / `putSubmissionSubtitlesSchema`：语言标签、显示名 1–50、`format` 枚举、正文；整体替换语义（0–2 条、语言不重复）
- [ ] `submitPaperSchema`：复用 `paperQuestionSchema`；科目、年份 2000–2100、标题 1–200、来源/权利说明 1–500（必填）、`rightsConfirmed` 必须为 `true`、题数 1–50；不接受 `slug` / `position` / `listed`
- [ ] `paperReviewSchema`（approve / reject+reason 1–500）与结果 schema
- [ ] 纯函数与边界单测：字符/字节边界、题号唯一升序、选择题必须有选项且非选择题不得带选项、语言标签、禁止字段（strictObject）
- [ ] 确认公开契约无变化：`pnpm --filter @mykaoyan/core generate:contract` 重复生成无差异；`apps/web/public/openapi.json`、`cli/contracts/openapi.json`、进度/发布 JSON Schema 不因本单改动

**验收标准：** 正/反例覆盖全部新 schema；边界值测试通过；契约产物无差异；`packages/core` 不引入框架/IO 依赖。

**红线：** 用户上传接口不进入公开 OpenAPI/CLI 契约；schema 中不出现真实题目、答案或本机路径；不新增依赖。

**验收命令：**

```bash
pnpm --filter @mykaoyan/core test
pnpm --filter @mykaoyan/core generate:contract && git diff --exit-code apps/web/public cli/contracts skills/mykaoyan/references
pnpm typecheck
```
