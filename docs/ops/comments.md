# 评论（ticket 21）

评论接在现有讲页面；访客可读，有效会员可发表评论和一层回复。非会员点击发表或回复时会看到手动开通、兑换码与365天会员期说明，并进入 `/login#membership`。登录成功会刷新会话并保留会员面板，普通登录仍回首页。

## 开放与权限

API 运行时配置 `COMMUNITY_ENABLED` 默认 `false`，只接受 `true` 或 `false`，空串报错。关闭时公开列表返回 `enabled:false` 且不返回评论，发表接口拒绝写入。页面据此隐藏发表入口，直接请求也不能绕过。管理员仍可维护关键词、审核历史评论。

ticket 22 的投稿已接入同一开关，见 [投稿说明](submissions.md)。真实环境是否开放仍受 ticket 24、ADR 0005 的条件约束，本轮没有开启、部署或执行远程迁移。

## 接口

| 接口 | 行为 |
| --- | --- |
| GET /api/lessons/:slug/comments?page=0 | 访客可读；仅整条课程、章、讲路径均上架时可见，每页50条、时间倒序，返回hasMore |
| POST /api/lessons/:slug/comments | `{body,parentId?}`；会话取本人身份，正文1–2000字；当前有效会员方可写，非会员与过期会员403 |
| GET /api/admin/comments?page=0 | 管理员分页查看评论与删除记录，包含未上架讲的评论 |
| GET /api/admin/comments/keywords | 管理员读取禁止关键词 |
| PUT /api/admin/comments/keywords | `{keywords}` 整体替换；最多500个，每个1–100字，空数组清空 |
| DELETE /api/admin/comments/:id | `{reason}`；管理员软删除，原因1–500字；重复删除409，不改写原记录 |

回复按独立条目参与分页，始终带父评论预览；不能回复回复、已删除评论或其他讲的评论。关键词按 NFKC 和小写规范后做字面子串匹配，不执行正则表达式。命中返回400并提示修改。

管理员会话与数据库当前角色均须为管理员；未登录401，普通账号403。评论接口不用 Agent 令牌。公开及管理员读取均带 `Cache-Control: no-store`。

## 删除与数据边界

内容管理页的“评论管理”可维护关键词，选择评论后必须填写原因才能删除。评论正文保留在数据库；删除标记与操作管理员、时间、原因在同一事务中写入。公开和管理员列表均把已删除正文及父评论预览遮蔽成“已删除”；公开列表不返回删除原因或完整账号编号。会员到期不删除历史评论。

`comments`、`comment_deletions`、`comment_keywords` 均开启 RLS 并对 PUBLIC、anon、authenticated 撤权，浏览器通过 API 访问。迁移只在专用本地临时 Postgres 重放验证，真实环境迁移另行授权。

## 投稿评论（ticket 27）

同一套规则也接到已上架的投稿上；评论对象是**已通过、已上架且文件未清理**的投稿，未上架、待审核、已清理或不存在的投稿一律404，访客读不到其评论。关键词沿用 `comment_keywords` 与同一套规范化匹配。

- 访客可读已上架投稿的评论；与讲评论一致，删除后列表显示“已删除”并遮蔽正文，公开列表不返回删除原因或完整账号编号。
- 发表和回复要求登录且为当前有效会员；**例外**：投稿上传者本人（`submissions.account_id` 等于当前账号）在自己的投稿下评论、回复不要求会员，会员到期后仍可继续。非会员且非上传者403，未登录401。
- 正文1–2000字；回复只有一层，父评论必须属于同一投稿且未删除，不能回复回复；入参严格校验。分页每页50条、时间倒序，返回 `hasMore`。
- 公开列表响应带 `viewer:{signedIn,member,owner}`，只描述当前请求账号能否评论，不泄露账号编号；页面据此显示登录入口、会员入口或“上传者免会员”提示。

| 接口 | 行为 |
| --- | --- |
| GET /api/submissions/:id/comments?page=0 | 访客可读；返回 `enabled`、评论、`hasMore` 与 `viewer` |
| POST /api/submissions/:id/comments | `{body,parentId?}`；登录后会员或该投稿上传者本人可写 |
| GET /api/admin/submission-comments?page=0 | 管理员分页查看全部投稿评论与删除记录，含未上架投稿 |
| DELETE /api/admin/submission-comments/:id | `{reason}`；管理员软删除并写审计；重复删除409，不改写原记录 |

`submission_comments`、`submission_comment_deletions` 开启 RLS 并对 PUBLIC、anon、authenticated 撤权；父评论用 `(parent_id, submission_id)` 复合外键限定同一投稿，删除审计独立表，外键级联随投稿或账号删除。迁移为 `20261031014614_lame_gauntlet.sql`，同样只在专用本地临时 Postgres 重放验证。

前端在投稿卡片点“查看评论”展开评论区，默认不预取多个投稿的评论；内容管理页新增“投稿评论管理”，必须填写原因才能删除。`COMMUNITY_ENABLED` 关闭时公开列表返回 `enabled:false` 且发表403，直接请求也不能绕过。
