# 11: Agent 令牌

**What to build:** 考生可以为自己的 agent 生成令牌、查看列表、随时吊销；令牌只能读写本人的进度文件，不能登录网页。

**Blocked by:** 10（进度文件云端读写（网页））

> M2 交接：先读 [HANDOFF-M2.md](../HANDOFF-M2.md)（现状、顺序、决策点、外部阻塞）。

**Status:** ready-for-human（本地完成；线上验收待部署）

- [x] 生成时只显示一次明文，库里只存哈希
- [x] 令牌访问 `/api/v1/progress` 成功，访问网页会话接口与他人数据失败
- [x] 吊销后立即失效（测试）
- [x] 令牌有最后使用时间，列表接口可见

## 现状（2026-10-29）

实现方式按交接文档的默认方案：自建表 + Nest 守卫，没有用 Better Auth 的 apiKey 插件。

- 表 `agent_tokens`（`packages/db/src/agent-tokens`）：`id`、`account_id`、`name`、`token_hash`（SHA-256）、`last4`、`created_at`、`last_used_at`、`revoked_at`；RLS 开启且迁移里 `REVOKE` anon/authenticated。
- 迁移 `packages/db/supabase/migrations/20261029062941_rare_sister_grimm.sql`，迁移测试断言 RLS 与表权限。
- 接口（`apps/api/src/agent-tokens`）：
  - `POST /api/agent-tokens` 生成 32 字节 base64url 明文，只在响应里返回一次；名字 1–40 字符。
  - `GET /api/agent-tokens` 列表含 `last4`、`createdAt`、`lastUsedAt`、`revokedAt`，不含明文或哈希。
  - `DELETE /api/agent-tokens/:id` 吊销；重复吊销、别人的令牌返回 404。
- 认证：`AgentTokenGuard` 先试网页会话，再试 `Authorization: Bearer <token>`；Bearer 只绑定账号，不建会话。`/api/v1/progress` 已换成该守卫，所以网页与 agent 都能读写同一份本人进度。
- 令牌管理接口本身仍只认 `SessionGuard`：令牌不能创建新令牌、不能访问管理员接口或 `/api/auth/*`。
- 每次成功 Bearer 校验更新 `last_used_at`（直写，后续再按需节流）。

测试 `apps/api/src/agent-tokens/agent-tokens.test.ts` 覆盖：一次性明文、列表无明文、非法名称、Bearer 读写本人进度、不能建会话、读不到别人数据、管理员/令牌接口拒绝、吊销立即 401、最后使用时间可见、别人的令牌不能吊销。

尚未做：给网页加令牌管理页（当前只有接口）；CLI/skill 的交互在工单 12、13 里接。
