# 13: Rust CLI 进度命令

**What to build:** 考生在终端里用 CLI 登录（保存 Agent 令牌）、拉取、离线校验、推送进度文件；推送时遵守 `If-Match`。

**Blocked by:** 11（Agent 令牌）

> M2 交接：先读 [HANDOFF-M2.md](../HANDOFF-M2.md)（现状、顺序、决策点、外部阻塞）。

**Status:** ready-for-human（本地完成；线上、Windows 验收未执行）

- [x] `login`、`progress pull`、`progress validate`、`progress push` 命令，遵循 Rust CLI Book 的约定（退出码、stderr、`--json` 输出）
- [x] 类型从 OpenAPI 生成，不依赖仓库内部代码
- [x] 令牌存放在系统配置目录，文件权限仅本人可读
- [x] 412 时提示先拉取再推送
- [x] 对一个模拟服务（按 OpenAPI 回放）的集成测试


## 实现与验收（2026-10-29）

- 新增独立 Cargo 工程 `apps/cli`，二进制 `mykaoyan`，不加入 pnpm workspace。命令为 `login`（隐藏输入或 `--token-stdin`）、`progress pull <文件>`、`progress validate <文件>`、`progress push <文件>`，帮助与安装见包内 README。
- 成功退出 0，操作失败 1，参数错误 2。`--json` 成功为 stdout JSON，错误为 stderr JSON；普通参数错误也不回显原始输入，防止误传令牌泄露。
- 令牌保存在系统配置目录；macOS 实测应用目录 0700、文件 0600，读取时拒绝权限过宽文件。Windows 在写入前设置当前账号 ACL，尚未真机实测。环境令牌优先于配置；令牌不通过参数传入，不跟随 HTTP 重定向。
- `pull` 写入新文件及 `.etag.json`，版本标识绑定站点与令牌摘要；已有文件拒绝覆盖。`push` 带原样 `If-Match`，412 停止，提示拉取到另一个文件合并，不自动换 ETag 重发。成功后 GET 核对 data 与 ETag，再更新本地文件。

### 类型生成选择

使用 typify：`build.rs` 从随包 `contracts/openapi.json` 的 ProgressFile、ProgressChangeSummary 生成类型到 OUT_DIR，构建代码不引用内部 TS 模块。公开契约生成脚本同步 CLI 副本，CI 与端到端测试检查一致性。原始 OpenAPI 约束由 jsonschema 离线验证，不依赖网络解析器。

已验证的生成边界：typify 把纯字符串 anyOf 映射为结构体，生成时宽化为 String，运行时仍保留原始 schema 约束；JSON integer 允许 `45.0`、`45e0`，只对类型解析副本和读回比较做安全整数规范化，HTTP 保留原始 JSON，不因 serde 的数值表示误拒绝或误报不一致。

### 验收证据

| 验证 | 结果 |
| --- | --- |
| TDD | 离线校验及 login 测试先失败，再实现通过 |
| Rust 检查 | cargo fmt、cargo clippy --all-targets -- -D warnings、cargo test --locked 通过，8 项集成测试 |
| 公开契约 fixture | 20 个既有 fixture 与 CLI 结论一致；CLI 与网站 OpenAPI 副本一致，共 21 项端到端检查 |
| 模拟 HTTP | 按 OpenAPI 回放 GET/PUT，验证认证、If-Match、摘要、读回、412 保留、401、302 不跟随、缺失 ETag；包含 45e0 到 45 的服务端规范化 |
| 实际本地运行 | 隔离临时 Postgres 重放全部迁移，真实 NestJS API；虚构账号和令牌，不调用真实短信 |
| CLI 全流程 | login 保存 → pull ETag revision-0 → 修改虚构每日记录（数学二45分钟）→ validate → push 200 → pull ETag revision-1，data 完全一致，摘要仅新增 daily 1 条 |
| 安装与跨目录 | 已 cargo install --path apps/cli --locked --debug；在仓库外运行 mykaoyan --help 成功 |
| 全仓库检查 | pnpm fmt、lint、typecheck、test、build 均通过；644 项测试，保留原有警告；媒体 Worker 仅 dry-run |
| 浏览器 / 真机 | 跳过，本工单是 CLI；Windows ACL 未真机验证 |
| 生产 | 未上传、未部署、未改云资源 |

code-review 以本轮工作区新增 CLI 与相关契约/CI 修改为范围，基准 HEAD，无本轮新增提交。Standards 发现参数错误回显输入，Spec 发现整数表示收紧和读回误判；均已修复、补回归并由原审查 agent 复核通过。

收尾：临时禁用 If-Match 后 HTTP 测试按预期失败，恢复后 8 项通过；最终安装版在仓库外向真实本地 API 推送含 `45e0` 的文件并读回成功。临时 API、数据库及测试配置凭据均已清理。未 commit、push 或部署。
