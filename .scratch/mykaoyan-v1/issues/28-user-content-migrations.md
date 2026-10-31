# 28: 用户内容数据库迁移（投稿形态、字幕、用户试卷来源与审核、试卷评论）

**What to build:** 从空库可重放的迁移与 Drizzle schema：`submissions` 增加 `kind` / `manuscript_markdown` 并按形态收紧约束；新增 `submission_subtitles`；`papers` 增加 `origin` / `review_status` / `reviewed_at` / `reviewer_id` / `review_reason` / `rights_confirmed_at`；新增 `paper_comments` / `paper_comment_deletions`；全部新表启用 RLS 并对 PUBLIC、anon、authenticated 撤权。

**Blocked by:** 27（`submission_comments` 迁移先合入，避免编号与顺序冲突）、22、26

**Status:** ready-for-agent

**Spec:** [规划 0005](../../../docs/specs/0005-user-uploads.md)｜**ADR:** [0017](../../../docs/adr/0017-user-content-uploads.md)

- [ ] `submissions`：新增 `kind`（默认 `video`，回填既有行）、`manuscript_markdown`；`size` / `duration` / `object_key` 放宽为可空；用按 `kind` 收紧的 check 替换 `submissions_limits`，保留 `state` / `visibility` / `review` 三条 check；新增 `(subject_code, kind, status, listed, created_at)` 索引
- [ ] 手稿相关 check：无 `object_key` / `upload_id` / `size` / `duration`，`status <> 'uploading'`；正文或 `deleted_at` 二选一；字符 ≤ 1,000,000、字节 ≤ 1,048,576；`fingerprint` 非空
- [ ] 新增 `submission_subtitles`：`submission_id` 级联、`language` 唯一（同一投稿）、`source_format`（`srt` / `vtt`）、`vtt_content`、`bytes` 1–262,144、`label` 1–50、时间戳；RLS 与撤权
- [ ] `papers`：新增六列并回填既有行为 `origin='admin'` / `review_status='approved'`；新增来源、审核一致性、驳回原因、`listed` 可见性 check；新增来源/审核/科目与所有者索引
- [ ] 新增 `paper_comments` / `paper_comment_deletions`：结构与 ticket 27 的投稿评论一致（父评论复合外键限定同一试卷、正文 1–2000 字、删除原因 1–500 字）；RLS 与撤权
- [ ] `packages/db` 导出新表与 schema；`packages/db` 迁移重放测试通过
- [ ] 约束测试：手稿带 object key、视频缺 size、非法 `kind`、未审核上架、非法来源、字幕超限/语言重复、试卷评论跨试卷回复均被数据库拒绝
- [ ] 回填读回：既有视频行 `kind='video'` 且字段不变；既有试卷行 `origin='admin'`、`review_status='approved'`

**验收标准：** 空库重放全部迁移成功；RLS 与撤权断言通过；约束正/反例覆盖；既有视频投稿与真题发布链路的读写在迁移后行为不变。

**红线：** 不删除或改写既有视频/试卷数据；迁移只在本地专用临时 Postgres 重放；生产迁移需站主批准；不写任何真实真题或答案内容。

**验收命令：**

```bash
pnpm --filter @mykaoyan/db test
pnpm typecheck
```
