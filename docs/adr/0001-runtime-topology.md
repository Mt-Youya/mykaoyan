---
status: accepted
---

# 前后端跑在阿里云 ECS，数据库用新加坡 Supabase，视频走 Cloudflare R2

用户在大陆，域名需要 ICP 备案，备案要求服务器在大陆；后端选定 NestJS，而 NestJS 依赖完整的 Node 运行时，跑不进 Cloudflare Workers。因此 TanStack Start 前端和 NestJS 后端都以 Node 进程跑在一台广州 ECS 上，由 Caddy 按路径分发（`/api/*` 给后端，其余给前端，同一域名、无跨域）；数据库用 Supabase 新加坡区域；视频存 R2，由 `media.mykaoyan.cn` 上的媒体 Worker 直接回给浏览器，不经过 ECS。DNS 留在 Cloudflare。

## Considered Options

- **全部跑在 Cloudflare Workers，ECS 只做反向代理**：NestJS 不能运行在 Workers 上；Cloudflare 中国网络只卖给企业版。
- **全部用阿里云（RDS、OSS、CDN）**：国内最快，但站主选择继续用 Supabase 和 R2，接受跨境延迟。
- **后端用 Rust**：登录、支付 SDK 都要自己写，安全风险和工作量都更大；Rust 只用于 CLI。
- **数据库用 Docker 跑在同一台 ECS**：省钱，但数据库和应用抢资源、单点故障、备份自理。

## Consequences

- ECS 到新加坡的每次查询都有跨境往返，接口要尽量减少每个请求的查询次数。M0 必须实测延迟。
- ECS 出口带宽只承担页面和接口，视频流量走 R2，因此 ECS 买小带宽即可。
- 扩容路径：先升级 ECS 规格，再加 ECS 和负载均衡。

## 修订记录

- 2026-10-28：ECS 地域确认为**广州**（华南 3）。原文「深圳」是拟定地域，按实际购买更正。
- 2026-10-28：[ADR 0010](0010-worker-api-proxy.md) 将「前端也跑在 ECS」改为「前端留在 Cloudflare Worker、ECS 只跑 NestJS API」。本 ADR 关于数据库（新加坡 Supabase）与视频（R2 + 媒体 Worker）的结论继续有效。
