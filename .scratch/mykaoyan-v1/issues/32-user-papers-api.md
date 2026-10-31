# 32: 用户试卷 API（提交、我的试卷、公开分源、答案与审核）

**What to build:** 在 `apps/api` 实现用户试卷：登录账号提交结构化试卷（先审后发），本人查看与预览，公开列表/题面按来源分开，答案接口复用会员/上传者/管理员规则，管理员审核与上下架守卫。

**Blocked by:** 28（迁移）、29（契约）、26（现有试卷 API）

**Status:** ready-for-human（2026-10-31 本机实现；API 类型检查与 lint 通过；集成测试已写入但本机无 Postgres，待 Lead 在临时库运行）

**Spec:** [规划 0005](../../../docs/specs/0005-user-uploads.md)｜**ADR:** [0017](../../../docs/adr/0017-user-content-uploads.md)

- [x] `POST /api/papers/submissions`：会话取上传者；社区开关；校验 `SubmitPaper`（含整卷字节上限、题号唯一升序、选项与题型一致性）；服务端生成 `slug`（`u-` + 12 hex）与 `position=0`；写入 `origin='user'`、`review_status='pending'`、`listed=false`、`owner_account_id`、`rights_confirmed_at`、`content_hash`、`content_version=1`；单事务写试卷与全部题目
- [x] `GET /api/papers/mine`、`GET /api/papers/mine/:slug`（路由注册在 `/papers/:slug` 之前）：本人列表（状态/驳回原因/题数）与全文预览（含答案，`no-store`）
- [x] `GET /api/papers?subject=&origin=admin|user`：默认 `origin=admin`，真题列表行为不变；`origin=user` 只返回 `approved + listed` 且社区开放；返回 `origin`
- [x] `GET /api/papers/:slug`：题面详情不含答案；用户试卷要求 `approved + listed` 且社区开放，否则 404；返回 `origin`
- [x] `GET /api/papers/:slug/answers`：登录；可见性（真题/用户试卷、社区开关）与本人/管理员预览；非会员且非本人/管理员 403；`no-store`；未上架/不存在 404
- [x] 管理员 `GET /api/admin/papers?status=&page=`、`GET /api/admin/papers/:slug`（含答案、`no-store`）、`POST /api/admin/papers/:slug/review`（approve/reject+reason，只处理 pending，重复 409，开放时通过即上架、关闭时只通过）
- [x] 上下架守卫：`PUT /api/admin/papers/:slug/listing` 对 `origin='user'` 要求已通过 + 社区开放；真题路径不变；写 `listing_changes` 审计
- [x] 权限测试：401/403/404/409；题面/列表无答案字段；用户试卷不混入真题列表；别人试卷不可读写；管理员角色回库复核
- [x] 控制器只解析参数，服务层做权限与业务；文件 ≤ 500 行

**备注（2026-10-31）：** 实现在 `apps/api/src/papers/**` 与 `apps/api/src/admin/listing.service.ts`（用户试卷上下架守卫）；管理列表 `/api/admin/content` 的试卷项新增 `origin` 与 `reviewStatus`。集成测试在 `apps/api/src/papers/user-papers.test.ts`，本机没有可用的临时 Postgres，未执行；提交后不可编辑/撤回按规划 0005 §7.1、§12 保持不实现（驳回后重新提交生成新试卷）。

**验收标准：** 用户试卷提交→待审核→不可公开→审核通过上架→公开题面/答案链路可用；答案隔离与 `no-store` 断言通过；社区关闭时公开出口关闭、本人/管理员可预览；真题发布与 `/exams` 行为不变。

**红线：** 未授权真题内容不得提交或审核通过；答案不进公开接口；用户试卷不参与评分；不新增 CLI/公开契约接口。

**验收命令：**

```bash
pnpm --filter @mykaoyan/api test
pnpm typecheck && pnpm build
```
