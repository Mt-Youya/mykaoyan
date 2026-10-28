---
status: accepted
---

# 备案等待期间，前端临时部署到独立 Worker

站主于 2026-10-27 确认：ECS 的备案还需等待，先将现有前端部署到 Cloudflare Workers，并直接使用 `mykaoyan.cn`。新增独立的 `mykaoyan-web`，将主域名作为 Custom Domain；已上线的 `mykaoyan` 继续只承载 `media.mykaoyan.cn` 的媒体服务。

## Considered Options

- **等待备案后再上线**：无法满足这次临时访问的要求。
- **将前端发布到媒体 Worker**：混淆职责，并可能覆盖媒体鉴权与 R2 绑定。
- **移除 Node 构建，全面迁移前端**：没有必要；备案完成后仍需保留原 ECS 运行方式。

## Consequences

- `apps/web` 默认 `build` 与 `start` 保留 Nitro Node 服务；`build:workers` 以 Vite 的 `workers` mode 使用 Cloudflare Vite plugin 构建，`deploy:workers` 用 `cf` 发布已检查的同一份产物。
- Workers 配置放在 `apps/web/cloudflare.config.ts`，不包含账号 ID、密钥、数据库连接或媒体签名密钥；`.cloudflare/` 产物与本地状态不进入 Git。
- 临时站点只提供当前已实现的 M0 Hello 页面。NestJS API 仍按原方案部署到 ECS，本次不增加 API 代理，不代表登录、课程、学习追踪或完整链路已经验收。
- CI 检查两个构建目标，并对 Workers 产物执行不上传的 dry-run。当前只授权本机发布，不能自动推送 Git 或增加自动生产部署。
- 备案完成后，可按原 Docker/Caddy 流程运行 Node 产物；届时是否保留临时 Worker 由站主决定。
- 本次不启用 `workers.dev` 或版本预览地址，不调整 `www`。恢复 ECS 的主域名路由需要另行确认，并重新核对 DNS、TLS 与 HTTP。

## 更新

- 2026-10-28：[ADR 0010](0010-worker-api-proxy.md) 取代本文的「不增加 API 代理」与「不能增加自动生产部署」两条：`mykaoyan-web` 现在把 `/api/**` 反代到广州 ECS 的 `api.mykaoyan.cn`，并新增手动触发的 [deploy-api.yml](../../.github/workflows/deploy-api.yml) 生产部署工作流。本文其余内容（独立 Worker、构建与发布方式、不启用 `workers.dev` 与预览地址）继续有效。
