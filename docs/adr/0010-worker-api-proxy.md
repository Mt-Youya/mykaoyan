---
status: accepted
---

# 前端保留在 Worker，API 单独部署到广州 ECS

站主于 2026-10-28 确认方案 B：`mykaoyan.cn` 前端继续由 Cloudflare Worker `mykaoyan-web` 承载，NestJS API 部署到广州 ECS，独立域名 `api.mykaoyan.cn`。Worker 把 `/api/**` 反代到 API，浏览器只访问 `mykaoyan.cn`，因此不需要 CORS，会话 cookie 仍是一方 cookie。

## Considered Options

- **整站搬回 ECS（原 Docker/Caddy 方案）**：需要等备案完成，且 Web 与 API 同机扩缩容不灵活；前端已经跑在 Worker 上，没必要迁回。
- **前端跨域直连 `api.mykaoyan.cn`**：需要改前端 API 基址、配置 CORS、处理跨站 cookie（SameSite/Domain），改动面大且登录态更脆弱。
- **API 也用 Worker 实现**：NestJS 与 Better Auth 依赖 Node 运行时，迁移成本远高于收益。

## Consequences

- `apps/web/worker-entry.ts` 是 Worker 入口：`/api` 与 `/api/**` 用 `fetch` 转发到 `https://api.mykaoyan.cn`，其余请求交给 `@tanstack/react-start/server-entry`；`apps/web/cloudflare.config.ts` 的 `entrypoint` 指向该文件。
- API 的公开地址固定为 `https://api.mykaoyan.cn`（目前直接写在 Worker 入口里）；如需灰度或多环境，再引入构建变量。
- 会话 cookie 需要跨子域共享：API 侧 `AUTH_COOKIE_DOMAIN=mykaoyan.cn` 启用 `advanced.crossSubDomainCookies`，`BETTER_AUTH_URL` 与 `AUTH_TRUSTED_ORIGINS` 都指向 `https://mykaoyan.cn`。
- API 镜像在容器内用 `node --import tsx src/main.ts` 运行 TypeScript 源码；`apps/api` 的 `build` 仍只做类型检查。镜像构建时把独立的 `tsconfig.runtime.json` 复制为 `tsconfig.json`，避免依赖仓库根的 `extends` 链。
- 新增 [.github/workflows/deploy-api.yml](../../.github/workflows/deploy-api.yml)：手动触发，先跑 CI，再只构建/推送 `api` 镜像，更新 ECS `/opt/mykaoyan-api` 的 compose 并做 `/api/health` 冒烟；前端 Worker 仍按 `deploy:workers` 手动发布。
- `deploy/api-compose.yaml` 只含 `api` 与 `caddy`，Caddy 只服务 `api.mykaoyan.cn`；ECS 的 `.env` 保存运行时密钥，不进入仓库与镜像。
- 备案通过前不切换 `mykaoyan.cn` 的 NS，网站不对外；通过后再切 Cloudflare NS、加 `api` 的 A 记录（灰云）并开放 80/443。
- 回滚：Worker 入口改回 `@tanstack/react-start/server-entry` 并重新发布即可回到纯前端；API 侧回滚到上一个镜像 tag，ECS compose 的 `.env.images` 记录当前引用。
