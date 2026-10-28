---
status: accepted
---

# Supabase 只当普通 Postgres 用，登录用 Better Auth

Supabase Auth 不支持 QQ、微信登录和阿里云短信认证，而所有读写都要经过 NestJS 做权限判断。因此只使用 Supabase 托管的 Postgres：登录、会话和多登录方式由 Better Auth 管，数据库访问用 Drizzle 经 Supavisor 连接池，浏览器从不直连 Supabase。不使用 Supabase Auth、Storage、Realtime、Edge Functions，也不依赖 PostgREST 加 RLS 的直连模式；RLS 只作为兜底防线保持开启并拒绝 `anon`、`authenticated` 角色。

## Consequences

- 以后要迁到阿里云 RDS 或自建 Postgres，主要工作是一次 `pg_dump` 加 `pg_restore`，应用代码基本不改。
- 权限判断全部在 NestJS 服务层，必须有测试覆盖「别人的数据读不到、写不进」。
- 生产库用免费版：项目长时间无访问会暂停，且没有可下载的自动备份，所以每天用 GitHub Actions 做 `pg_dump` 存到 R2 私有桶。
