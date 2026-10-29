---
status: accepted
---

# 前端从 Cloudflare Worker 回到广州 ECS

站主于 2026-10-29 确认：`mykaoyan.cn` 的前端与 NestJS API 都部署在广州 ECS，由同一个 Caddy 按路径分流；域名解析继续留在阿里云，备案通过后给主域加 A 记录。Cloudflare 只保留 `media.mykaoyan.cn` 的媒体 Worker 与 R2。

## 背景

- [ADR 0008](0008-temporary-web-worker.md)、[ADR 0010](0010-worker-api-proxy.md) 的路线是「前端留在 Cloudflare Worker，备案通过后再切 NS」。实际卡点是 **Worker 的 Custom Domain 要求该域名的 zone 在 Cloudflare 处于 active**，而 NS 一直在阿里云 hichina：2026-10-29 实测，Cloudflare zone 里 apex 与 media 的记录齐全，阿里云侧记录集为空，`mykaoyan.cn` 根本不解析。
- 备案是为这台广州 ECS 办的，站点最终必须落在它上面；前端多放一层 Worker 反而多一个依赖。
- 站主明确要求「都用阿里云」，并拒绝在备案审核期切换 NS 或加解析。

## Considered Options

- **切 NS 到 Cloudflare（ADR 0010 的终态）**：一次操作就能让主域可用，但备案审核期域名对外可访问，存在被判定「已开通」的抽查风险；站主否掉。
- **继续等 Worker**：域名不可用，无法验收页面。
- **前端 + API 同机 ECS（采纳）**：与备案主体一致，DNS 留在阿里云，备案通过后加 A 记录即可。

## Consequences

- 生产形态改为单机 Docker：`caddy`（边缘）按路径分流，`/api/*` → `api:3001`，其余 → `web:3000`；备案前用 8080 预览，备案通过后开放 80/443 并由 Caddy 申请证书。
- `apps/web` 的 Nitro/Node 构建成为主发布物；`apps/web/worker-entry.ts` 的 `/api` 反代与 `apps/web/cloudflare.config.ts` 在正式切换后可退休（本次未删，避免与并行会话冲突）。
- 数据库：Supabase 项目在**东京 `ap-northeast-1`**（不是原计划的「新加坡」），5 个迁移已应用。
- 备案通过前，只能通过 ECS 公网 IP + 8080 访问；任何带域名的请求都会被阿里云按 Host 头拦截，与端口无关。
- 短信资质批下来之前，`NODE_ENV` 只能停在 `development` + `SMS_PROVIDER=memory`，登录不可用（见下文「未完成」）。
- 部署细节、验证基线与本次踩到的坑见 [当前部署](../ops/current-deployment.md)。

## 未完成

- 备案通过：主域加 A 记录、放行 80/443、Caddy 签证书。
- 短信：阿里云号码认证（Dypnsapi）AccessKey + 已审核签名/模板 → 才能把 `NODE_ENV` 切到 `production`。
- 清理：前端确认不回落 Worker 后，删除 `apps/web/worker-entry.ts` 的 `/api` 反代与 `cloudflare.config.ts`；媒体域不动。
