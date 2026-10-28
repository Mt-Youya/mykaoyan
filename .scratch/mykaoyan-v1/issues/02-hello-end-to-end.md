# 02: Hello 全链路上线

**What to build:** 访问站点首页能看到 Hello 页面，`/api/health` 返回 200 并证明后端连上了 Supabase dev 库；两个服务以镜像形式部署在 ECS 上，由 Caddy 按路径分发，部署后自动冒烟检查；并拿到国内访问的实测数据。

**Blocked by:** 01（仓库卫生与 monorepo 骨架）

**Status:** ready-for-human（仅本地部分；外部验收待环境）

- [x] TanStack Start 以 Node 服务运行，NestJS 以 Node 服务运行，`/api/*` 由 Caddy 转给后端、其余转给前端
- [ ] `/api/health` 实际执行一次数据库查询，经 Supavisor transaction 模式、SSL `verify-full`、`prepare: false`
- [x] 环境变量启动时用 zod 解析，未设置或空串直接启动失败，有测试
- [ ] GitHub Actions 构建镜像推到阿里云 ACR，SSH 到 ECS 执行 compose 更新，镜像里不含任何密钥
- [ ] 部署后冒烟检查：首页 200、`/api/health` 200；任一失败则工作流失败
- [ ] 交付报告记录国内至少三地（含晚高峰）的首页首字节时间与健康检查耗时；备案未通过时注明用了哪种临时访问方式
- [x] TypeScript 版本与 TanStack Start、NestJS、Drizzle 的构建兼容性已验证并钉住

## 本轮交付说明

本地实现与分层验证见 [M0 本地交付报告](../../../docs/delivery/m0-local.md)。未勾选项包含真实云资源、CI 或网络验收；本机替身与临时数据库测试不能替代这些证据。本轮仅作本地提交，未 push 或部署。
