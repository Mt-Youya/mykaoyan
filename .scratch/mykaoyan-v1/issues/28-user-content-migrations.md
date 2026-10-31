# 28: 用户内容数据库迁移（投稿形态、字幕、用户试卷来源与审核、试卷评论）

**What to build:** 从空库可重放的迁移与 Drizzle schema：`submissions` 增加 `kind` / `manuscript_markdown` 并按形态收紧约束；新增 `submission_subtitles`；`papers` 增加 `origin` / `review_status` / `reviewed_at` / `reviewer_id` / `review_reason` / `rights_confirmed_at`；新增 `paper_comments` / `paper_comment_deletions`；全部新表启用 RLS 并对 PUBLIC、anon、authenticated 撤权。

**Blocked by:** 27（`submission_comments` 迁移先合入，避免编号与顺序冲突）、22、26

**Status:** ready-for-human（本机实现、类型检查与生成幂等通过；迁移重放与数据库约束测试待 Lead 在临时库运行）

**Spec:** [规划 0005](../../../docs/specs/0005-user-uploads.md)｜**ADR:** [0017](../../../docs/adr/0017-user-uploads.md)

- [x] 迁移 `20261031022329_slim_betty_ross.sql`（`pnpm --filter @mykaoyan/db generate` 生成后手工补 REVOKE）：`submissions` 新增 `kind`（默认 `video`，既有行由默认值回填）、`manuscript_markdown`；`size` / `duration` / `object_key` 放宽为可空；删除 `submissions_limits`，新增按 `kind` 收紧的 `submissions_kind_limits` 与 `submissions_kind`；保留 `submissions_state` / `submissions_visibility` / `submissions_review` 三条 check；新增 `submissions_subject_kind_status_listed_created_idx`
- [x] 手稿相关 check：无 `object_key` / `upload_id` / `size` / `duration`，`status <> 'uploading'`；正文或 `deleted_at` 二选一；字符 ≤ 1,000,000、字节 ≤ 1,048,576；`fingerprint` 非空（列本身 NOT NULL 不变）
- [x] 新增 `submission_subtitles`：`submission_id` 级联、`(submission_id, language)` 唯一、`source_format`（`srt` / `vtt`）、`vtt_content`、`bytes` 1–262,144 且等于 `octet_length(vtt_content)`、`label` 1–50、语言标签正则、时间戳；RLS 与撤权
- [x] `papers`：新增六列并回填既有行为 `origin='admin'` / `review_status='approved'`；新增来源/审核状态枚举、审核一致性（admin 恒 approved；user 必须有 `rights_confirmed_at`；pending 无审核人/时间；approved/rejected 必有审核人/时间；rejected 必须带 1–500 字原因）、通过时原因必须为空、`listed=true` 必须 approved 的 check；新增 `papers_origin_review_subject_year_position_idx` 与 `papers_owner_created_idx`
- [x] 新增 `paper_comments` / `paper_comment_deletions`：结构与 ticket 27 的投稿评论一致（父评论复合外键限定同一试卷、正文 1–2000 字、删除原因 1–500 字）；RLS 与撤权
- [x] `packages/db` 导出新表与 schema（`submissions` / `comments` 模块经 `src/index.ts` 的 `export *` 导出）；`drizzle.config.ts` 无需新增文件
- [x] 迁移测试补断言（`src/migrations.test.mjs`）：三张新表 RLS 与公开角色撤权；`kind` 正反例、手稿清理后正文可空、字幕语言/格式/大小/字节一致性/级联、`papers` 来源与审核约束与未审核不能上架、试卷评论跨试卷回复与级联删除
- [ ] 迁移重放与约束测试实际运行（本机无 psql/Postgres；待 Lead 在专用临时库运行 `pnpm --filter @mykaoyan/db test`）
- [ ] 回填读回（既有视频行 `kind='video'` 且字段不变；既有试卷行 `origin='admin'`、`review_status='approved'`）——回填由列默认值完成，迁移测试中的默认值断言待临时库读回

**验收证据（2026-10-31 本机）：**

- `pnpm --filter @mykaoyan/db generate` 生成 `20261031022329_slim_betty_ross.sql` 与快照；再次 generate 输出 `No schema changes, nothing to migrate`，幂等。
- 迁移尾部手工补 `REVOKE ALL ON TABLE public.submission_subtitles,public.paper_comments,public.paper_comment_deletions FROM PUBLIC,anon,authenticated;`（与 20261031014614 同格式）。
- `pnpm --filter @mykaoyan/db typecheck`、`pnpm --filter @mykaoyan/db build` 通过；改动文件 oxlint/oxfmt 通过。
- 未做：迁移从空库重放、RLS/约束正反例的实际执行（本机无 psql/Postgres/initdb/Docker，`tests/with-postgres.py` 无法运行）；生产迁移未执行。
- 既有行为兼容性按 SQL 与现有代码核对：投稿上传/审核/上架/清理只写视频字段，`kind` 默认 `video`；管理员发布真题与既有试卷行由默认值落为 `origin='admin'` / `review_status='approved'`。

**红线：** 不删除或改写既有视频/试卷数据；迁移只在本地专用临时 Postgres 重放；生产迁移需站主批准；不写任何真实真题或答案内容。

**验收命令：**

```bash
pnpm --filter @mykaoyan/db test
pnpm typecheck
```

- 2026-10-31 补充：papers.reviewer_id 改为普通 uuid（移除 accounts 外键），保留审核审计值但不随账号删除置空；避免删除账号触发 papers_review 约束失败。迁移 20261031032524_complex_stryfe.sql。
