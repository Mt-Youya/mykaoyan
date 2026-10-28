# 01: 仓库卫生与 monorepo 骨架

**What to build:** 仓库可以安全公开：敏感文件和依赖目录被忽略，pnpm workspace 建好，每个包自己声明依赖，`core` 包里有第一个纯函数 `LocalDate`（Asia/Shanghai）和测试，CI 在每次推送时跑格式化、lint、类型检查、测试和密钥扫描。

**Blocked by:** None (can start immediately)

**Status:** ready-for-human（仅本地部分；外部验收待环境）

- [x] `.gitignore` 忽略依赖目录、`.env*`、构建产物、wrangler 与 Nitro 输出、本地私有内容目录
- [x] 根 `package.json` 只保留全仓库工具；`tailwindcss`、`@types/react`、supabase CLI 等移到实际使用的包；一次干净安装（删除依赖目录后重装）各包都能解析自己的依赖
- [x] `devEngines` 与 `packageManager` 写精确版本
- [x] `LocalDate` 有表格驱动测试，覆盖跨日（UTC 16:00 前后）与闰年
- [ ] CI 依次运行 fmt 检查、lint、typecheck、test、密钥扫描；故意提交一个假密钥时 CI 变红（变异检查）
- [x] 根目录有 `pnpm fmt`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 聚合脚本，覆盖全部包
- [x] README 写明代码 MIT、课程内容保留所有权利

## 本轮交付说明

本地实现与分层验证见 [M0 本地交付报告](../../../docs/delivery/m0-local.md)。未勾选项包含真实云资源、CI 或网络验收；本机替身与临时数据库测试不能替代这些证据。本轮仅作本地提交，未 push 或部署。
