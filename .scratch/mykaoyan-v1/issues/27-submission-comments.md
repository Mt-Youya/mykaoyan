# 27: 投稿评论（会员可评；上传者本人免会员）

**What to build:** 在已上架的投稿下增加评论：访客可读；有效会员可发表与一层回复；例外是投稿上传者本人在自己的投稿下评论/回复不要求会员；管理员可删除评论并留审计。

**Blocked by:** 21（评论规则）、22（投稿）、23（已上架投稿列表）

**Status:** ready-for-human（本机实现、类型检查与集成测试通过；默认关闭，真机与真实环境待验收）

- [x] 迁移 `20261031014614_lame_gauntlet.sql`：`submission_comments`、`submission_comment_deletions`；RLS、PUBLIC/anon/authenticated 撤权、复合外键限定父评论同投稿、正文 1–2000 字、级联删除、时间索引
- [x] drizzle schema（`packages/db/src/comments`）与包导出；迁移测试补两张表的 RLS/权限断言
- [x] API：`GET/POST /api/submissions/:id/comments`；未登录 401、非会员且非上传者 403、投稿不存在/未上架/已清理 404、非法入参 400；公开列表带 `enabled` 与 `viewer:{signedIn,member,owner}`
- [x] API：`GET/DELETE /api/admin/submission-comments`；管理员会话与数据库角色双重校验；删除留 `submission_comment_deletions` 审计，重复删除 409
- [x] 复用：关键词表 `comment_keywords`、正文长度、一层回复、删除后遮蔽正文、分页每页 50、`Cache-Control: no-store`、`COMMUNITY_ENABLED` 开关
- [x] 前端：投稿卡片“查看评论”展开评论区；访客显示登录入口、非会员显示会员入口、上传者显示免会员提示；发表/回复/分页；内容管理页新增“投稿评论管理”
- [x] 测试：API 集成测试覆盖 401/403/上传者例外/会员可评/访客可读/未上架 404/回复层级/关键词/删除审计/重复删除/会员过期保留；web 覆盖权限映射与默认折叠；API、web、db 全仓库 typecheck 通过
- [x] 文档：`docs/ops/comments.md` 补投稿评论规则；`docs/PLAN.md` §5.2 补规则
- [x] 集成测试在临时 Postgres 上通过（迁移 20261031014614 已重放）
- [ ] 生产迁移与真实社区开放需站主批准
- [ ] 批量/真机浏览器实测（本轮未部署、未开启真实社区）

**验收证据：**

- `pnpm typecheck`（全仓库）、`pnpm --filter @mykaoyan/db build`、`pnpm --filter @mykaoyan/web build` 通过；`pnpm lint` 仅剩 `apps/api/src/papers/{controller,service}.ts` 两处既有 import 排序错误（不是本轮文件），新增/改动文件 oxlint 0 error、oxfmt 通过。
- web Vitest 90/90 通过（含新增 2 项：权限映射、默认折叠）。
- 临时 Postgres（Lead 提供，迁移已重放）：`DATABASE_URL=… pnpm --filter @mykaoyan/api exec vitest run src/comments` → 2 文件 13/13 通过；其中 `submission-comments.test.ts` 8/8（401/403/上传者例外/会员可评/访客可读/未上架404/回复层级/关键词/删除审计/重复删除/会员过期保留/viewer 标志）。同库跑 `src/submissions` → 8/8，确认新控制器未与投稿路由冲突。
- 迁移由 `pnpm --filter @mykaoyan/db generate` 生成后手工在尾部补 `REVOKE ALL ON TABLE public.submission_comments,public.submission_comment_deletions FROM PUBLIC,anon,authenticated`；再次 generate 无差异。
- 本机没有 Postgres/psql/initdb/Docker/Python，`tests/with-postgres.py` 无法在本机运行，集成测试用的是 Lead 的临时库。

**红线：** 公开响应不返回完整账号编号、删除原因或未上架投稿评论；不 commit、不 push、不改云资源。
