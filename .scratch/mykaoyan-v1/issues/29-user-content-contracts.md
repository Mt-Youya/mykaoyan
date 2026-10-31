# 29: 用户内容契约与校验（手稿、字幕、用户试卷、审核请求）

**What to build:** 在 `packages/core` 增加用户上传所需的 zod 契约与常量：投稿 `kind`、手稿输入、字幕轨道与整体替换、用户试卷提交、试卷审核请求与结果；所有规则与 Web/API 共用，不新增公开 OpenAPI/JSON Schema 产物。

**Blocked by:** 22、26（现有契约与校验先例）

**Status:** done（2026-10-31 本机实现，类型检查、单测与契约生成幂等通过）

**Spec:** [规划 0005](../../../docs/specs/0005-user-uploads.md)｜**ADR:** [0017](../../../docs/adr/0017-user-uploads.md)

- [x] `SUBMISSION_KINDS` 与常量：手稿字符上限 1,000,000、字节上限 1,048,576；字幕单条字节上限 262,144、每投稿 2 条；用户试卷题数上限 50、整卷题面+答案+解析字节上限 512 KiB
- [x] `manuscriptSubmissionInputSchema`：`id`（客户端 UUID 幂等）、`kind='manuscript'`、标题 1–200、简介 ≤ 2000、三位科目、可空考点（属于所选科目）、`manuscriptMarkdown` 1–1,000,000 字符（拒绝 NUL；UTF-8 字节数 ≤ 1,048,576 由同一 schema 校验）
- [x] `submissionSubtitleTrackSchema` / `putSubmissionSubtitlesSchema`：语言标签、显示名 1–50、`format` 枚举、正文（单条 ≤ 262,144 字节）；整体替换语义（0–2 条、语言不重复）
- [x] `submitPaperSchema`：复用 `paperQuestionSchema`；科目、年份 2000–2100、标题 1–200、来源/权利说明 `sourceNote` 1–500（必填）、`rightsConfirmed` 必须为 `true`、题数 1–50；题号唯一且严格升序、选择题必须有 2–8 个选项且非选择题不得带选项、整卷字节上限；`strictObject` 不接受 `slug` / `position` / `listed` / 审核字段
- [x] `paperReviewSchema`（approve / reject+reason 1–500）与 `paperReviewResultSchema`（审核后状态、上架状态、审核时间、驳回原因）；`PAPER_ORIGINS` / `PAPER_REVIEW_STATUSES` 常量
- [x] 纯函数与边界单测：手稿字符/UTF-8 字节边界、NUL、字幕语言/字节/条数与语言重复、用户试卷题号顺序、选项/题型一致性、整卷字节上限、`rightsConfirmed`、禁止字段（`strictObject`）、审核请求/结果
- [x] 确认公开契约无变化：`pnpm --filter @mykaoyan/core generate:contract` 重复生成无差异；`apps/web/public/openapi.json`、`cli/contracts/openapi.json`、进度/发布 JSON Schema 未改动
- [x] `packages/core` 不引入框架/IO 依赖（新增的 UTF-8 字节计算为纯函数，避免依赖 `TextEncoder` 类型/运行时）

**验收证据（2026-10-31 本机）：**

- `pnpm --filter @mykaoyan/core test`：17 个测试文件、173 项全部通过（新增 7 + 5 项）。
- `pnpm --filter @mykaoyan/core typecheck`、`pnpm --filter @mykaoyan/db typecheck`、`pnpm --filter @mykaoyan/db build` 通过；改动文件 oxlint 0 error、oxfmt 通过。
- `pnpm --filter @mykaoyan/core generate:contract` 后 `git status apps/web/public cli/contracts skills/mykaoyan/references` 为空，公开契约产物未变化。
- 未做：API/前端接入与端到端验收（后续工单 30–34）。

**红线：** 用户上传接口不进入公开 OpenAPI/CLI 契约；schema 中不出现真实题目、答案或本机路径；不新增依赖。

**验收命令：**

```bash
pnpm --filter @mykaoyan/core test
pnpm --filter @mykaoyan/core generate:contract && git diff --exit-code apps/web/public cli/contracts skills/mykaoyan/references
pnpm typecheck
```
