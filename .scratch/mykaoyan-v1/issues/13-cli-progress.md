# 13: Rust CLI 进度命令

**What to build:** 考生在终端里用 CLI 登录（保存 Agent 令牌）、拉取、离线校验、推送进度文件；推送时遵守 `If-Match`。

**Blocked by:** 11（Agent 令牌）

**Status:** ready-for-agent

- [ ] `login`、`progress pull`、`progress validate`、`progress push` 命令，遵循 Rust CLI Book 的约定（退出码、stderr、`--json` 输出）
- [ ] 类型从 OpenAPI 生成，不依赖仓库内部代码
- [ ] 令牌存放在系统配置目录，文件权限仅本人可读
- [ ] 412 时提示先拉取再推送
- [ ] 对一个模拟服务（按 OpenAPI 回放）的集成测试
