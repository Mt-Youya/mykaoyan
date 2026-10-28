# 08: 管理员角色与上下架

**What to build:** 管理员可以在网页上上架或下架讲和讲义；普通账号和访客看不到也用不了这些操作。

**Blocked by:** 05（手机号验证码登录）、06（课程、章、讲、讲义的浏览）

**Status:** ready-for-human（本地完成；待站主验收）

- [x] 账号有管理员角色，只能由数据库迁移或已有管理员授予
- [x] 上架、下架接口的权限矩阵测试：访客 401、账号 403、管理员成功
- [x] 上下架操作留下记录（谁、何时）
- [x] 下架后访客立即看不到该内容

## 本轮交付说明

- 角色：`accounts.role`（默认 `account`），目前只能通过数据库迁移或 SQL 授予管理员，没有自助提权接口。
- 接口：`PUT /api/admin/lessons/:slug/listing`、`PUT /api/admin/handouts/:slug/listing`，body `{ listed: boolean }`；`GET /api/admin/content` 列出全部讲与讲义（含未上架）。
- 权限：`SessionGuard` 未登录 401；服务层判断角色，非管理员 403，且不改变状态、不写记录。
- 记录：`listing_changes`（target_type、target_id、listed、actor_id → accounts.id、created_at），与状态更新在同一事务内。
- 页面：`/admin/content`（`apps/web/src/features/admin/`），列出全部内容与上架状态并可切换；访客提示登录、非管理员提示无权限。
- 测试：`apps/api/src/admin.test.ts` 6 项，覆盖 401/403/管理员成功、审计记录、下架后公开接口与课程详情都不再出现该讲、重新上架后恢复、非法 body 400、不存在 slug 404。
- 未完成：真机与站主验收；管理员授予目前没有界面，属数据库操作。
