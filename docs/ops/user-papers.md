# 用户试卷提交与审核（ticket 32、33）

登录账号可以在社区开放时提交结构化试卷（题面 + 答案 + 解析），先审后发。用户试卷复用 `papers` / `paper_questions` 与管理端真题同一套题面页、答案页与上下架审计，用 `origin='user'` 与站主真题（`origin='admin'`）区分；公开出口分开，`/exams` 只列真题，用户试卷走 `/community/papers`。答案隔离规则不因 UGC 放松：题面公开，答案与解析只在登录后的答案页/接口出现，不进入题面页、列表、摘要、OG、sitemap 与站内搜索。

决策见 [ADR 0017](../adr/0017-user-content-uploads.md)，细则见[规划 0005](../specs/0005-user-uploads.md)。

## 配置与开放

与投稿、评论共用 API 运行时 `COMMUNITY_ENABLED`，默认 `false`，只接受 `true` / `false`。

- 关闭时：`POST /api/papers/submissions` 返回 403；`GET /api/papers?origin=user` 返回空列表；用户试卷的公开题面与答案对非本人返回 404；通过审核只记为已通过、不自动上架，也不能手动上架。
- 关闭时本人仍可在「我的试卷」读取自己的记录与全文，管理员仍可审核与预览。
- 真题（`origin='admin'`）的发布、列表、上下架与答案接口行为不变。

## 使用

1. 登录（只要求登录、不要求会员）后在 `/community/papers/new` 逐题填写题号、题型、分值、考点、题面、选项（选择题 2–8 个 A–H）、答案与解析；也可以导入符合 `SubmitPaper` 的 JSON 文件，浏览器用 `packages/core` 的同一份 zod 校验后再提交。
2. 提交时必须勾选权利声明（「本人拥有或已获授权」），服务端记录 `rights_confirmed_at`。服务端生成 `slug`（`u-` + 12 位十六进制）与 `position=0`，写入即 `review_status='pending'`、`listed=false`、`content_version=1`，并对规范化后的提交输入计算 `content_hash` 供审计。
3. 提交后进入「我的试卷」（`/community/papers/mine`），展示待审 / 已驳回 / 已通过状态、题数与驳回原因。**提交后不可编辑、不可撤回**；被驳回后重新提交会生成一份新试卷（新 slug），旧记录保留。
4. 管理员在 `/admin/content` 的「用户试卷审核」按状态筛选，预览含答案与解析的完整试卷，通过或驳回（驳回必须填写 1–500 字原因，本人可见）。重复审核返回 409，不覆盖已有审核记录。
5. 社区开放时审核通过即自动上架；关闭时只记录通过、保持未上架。已通过试卷可在管理员内容列表单独上下架，每次操作写 `listing_changes`（`target_type='paper'`）。未通过的试卷不能上架（409）。
6. 公开列表 `/community/papers` 只显示 `approved + listed` 的用户试卷；题面页 `/community/papers/$slug` 不含答案；答案页 `/community/papers/$slug/answers` 声明 `noindex`。答案接口对有效会员、试卷上传者本人与管理员放行；其他登录账号 403，未登录 401，未上架/不存在 404，响应 `Cache-Control: no-store`。
7. 用户试卷不参与评分与推荐，也没有自动清理：驳回后正文保留，仅本人/管理员可见。

## 接口

全部用户试卷接口使用网页会话，Agent 令牌不能提交或看答案。未登录 401；已登录无权限 403；不存在或别人的资源 404；状态冲突 409；参数无效 400。分页从 0 开始、每页 50 条、返回 `hasMore`。

| 接口 | 行为 |
| --- | --- |
| POST /api/papers/submissions | 登录即可提交 `SubmitPaper`（科目、年份、标题、来源/权利说明、`rightsConfirmed:true`、1–50 题）；写入 `origin='user'`、`pending`、`listed=false`、所有者与权利确认时间；返回 `slug`、状态与题数 |
| GET /api/papers/mine?page=0 | 本人用户试卷列表，含审核状态、驳回原因、题数、提交与审核时间；社区关闭时 `enabled=false` 但仍可读 |
| GET /api/papers/mine/:slug | 本人试卷全文（含答案与解析），`no-store`；别人的试卷 404 |
| GET /api/papers?subject=302 | 公开列表，默认 `origin=admin`（真题）；`origin=user` 只返回已通过且上架的用户试卷，社区关闭时为空；返回 `origin` |
| GET /api/papers/:slug | 题面详情（不含答案）；用户试卷要求已通过、已上架且社区开放，否则 404；返回 `origin` |
| GET /api/papers/:slug/answers | 登录；会员 / 上传者本人 / 管理员可读；未上架或社区关闭时仅本人与管理员可预览，其他人 404；`no-store` |
| GET /api/admin/papers?status=&page=0 | 管理员：用户试卷审核列表（可按 `pending` / `approved` / `rejected` 筛选），含来源账号、提交时间与题数；`no-store` |
| GET /api/admin/papers/:slug | 管理员：含答案与解析的完整试卷预览；`no-store` |
| POST /api/admin/papers/:slug/review | `{decision:"approve"}` 或 `{decision:"reject",reason}`；只处理 `pending`；开放时通过即上架，关闭时只通过；重复审核 409 |
| PUT /api/admin/papers/:slug/listing | `{listed}`；用户试卷要求已通过且社区开放（上架时）；真题行为不变；写 `listing_changes` 审计 |

`papers` 的 `origin` / `review_status` / `reviewed_at` / `reviewer_id` / `review_reason` / `rights_confirmed_at` 由迁移 `20261031022329_slim_betty_ross.sql` 建立，并有数据库 check 收紧：`admin` 恒为 `approved`；`user` 必须有 `rights_confirmed_at`，`pending` 不得有审核人与时间，`approved` / `rejected` 必须有，`rejected` 必须带 1–500 字原因；`listed=true` 必须 `approved`。管理员权限在每个管理员接口回库复核。

## 上线前核查

- 迁移只在本机专用临时库重放；远程数据库未迁移、未部署、未开启真实社区。
- 审核通过不代表授权确认；未取得授权的真题原文、题图与答案不得提交或审核通过，授权与合规责任仍由运营者承担。
- 测试与 fixture 只用虚构题目；仓库不写入任何真实真题或答案。
- 本机若没有可用的临时 Postgres，`pnpm --filter @mykaoyan/api test` 的集成测试无法运行；需在 Lead 提供的临时库上执行（见 `tests/with-postgres.py`）。前端检查用 `pnpm --filter @mykaoyan/web test`、`pnpm --filter @mykaoyan/web typecheck` 与 `pnpm --filter @mykaoyan/web build`。
