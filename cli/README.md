# mykaoyan CLI

需要 Rust 1.93+。这是独立 Cargo 工程，不加入 pnpm workspace。

```sh
cargo install --path cli --locked
mykaoyan --help
mykaoyan login
mykaoyan progress pull progress.json
mykaoyan progress validate progress.json
mykaoyan progress push progress.json
```

`login` 交互输入 Agent 令牌，不回显；自动化可用 `login --token-stdin` 从标准输入读入。不要把令牌写在命令参数、聊天或公开仓库。登录只保存令牌，不创建网页会话，也不联网验证；后续读写时由服务端鉴权。

凭据在系统配置目录的 `mykaoyan/config.json`：macOS 为 `~/Library/Application Support`，Windows 为 `%APPDATA%`，Linux 为 `$XDG_CONFIG_HOME`（未设置时 `~/.config`）。Unix 文件权限 0600、应用目录 0700；Windows 在写入令牌前设置仅当前账号有权访问的 ACL。Windows 权限分支尚未真机验收。

认证优先使用 `MYKAOYAN_TOKEN`，然后是保存的配置。`--origin` 优先于 `MYKAOYAN_ORIGIN`，未指定时使用已保存站点或默认 `https://mykaoyan.cn`。不接受空环境值；更换站点不能复用配置里的令牌。仅本地回环允许 HTTP，不跟随重定向。

`pull` 只写新文件，避免覆盖本地编辑；同时写入 `<文件>.etag.json`，包含原样 ETag、站点和令牌摘要。修改进度文件后，`push` 自动读取它；不使用 revision 拼 ETag，也不会先获取新 ETag 强行覆盖。请将这两个文件都保存在私有目录，不提交仓库。

推送是整份替换。先拉取、保留无关记录、离线校验，再推送。412 时保留文件并停止：拉取到另一个文件，比较、合并后再推送。令牌更换后也要重新拉取合并。网络超时可能已经写入，先拉取核对，不自动重试。成功后再次 GET 比较 data 与 ETag，然后更新本地文件及 ETag；元数据由服务器决定。

## 输出约定

退出码：0 成功，1 文件/校验/认证/网络/冲突失败，2 参数错误。普通输出供人阅读，错误写 stderr；`--json` 成功为 stdout 单个 JSON，错误为 stderr 单个 `{"error":"说明"}`，stdout 保持空。帮助与版本信息保留 clap 的文本形式。

| 命令 | `--json` 成功示例 |
| --- | --- |
| login | `{"saved":true}` |
| progress pull | `{"saved":true,"etag":"\"revision-0\""}` |
| progress validate | `{"valid":true}` |
| progress push | 透传公开契约的变更摘要 `{app,version,etag,changes}` |

离线校验仅检查格式，不证明复测独立完成、记录真实或日期之间的业务关系。题目、答案、词表等私有内容不应放入上传文件。详细字段见 `skills/mykaoyan/references/progress-v1.md`。

## 契约与验证

`contracts/openapi.json` 由公开契约生成脚本同步；`build.rs` 用 typify 从其 `ProgressFile`、`ProgressChangeSummary` 与发布相关的 `PublishLesson`、`PublishPrepared`、`PublishResult` 组件生成 Rust 类型到 Cargo OUT_DIR。代码不导入网站内部模块。纯字符串 anyOf 在类型生成时宽化为 String，以绕过 typify 的结构体映射；运行时仍用原始 schema 完整校验，HTTP 请求保留原始 JSON，避免类型序列化改变数据。

```sh
cargo fmt --manifest-path cli/Cargo.toml --check
cargo clippy --manifest-path cli/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path cli/Cargo.toml --locked
```

模拟服务按随包 OpenAPI 回放 GET/PUT 及错误响应；测试验证 If-Match、认证头、推送读回、冲突保留、重定向拒绝、缺失 ETag 与离线 JSON 错误。本地真实 API 验收单独记录在工单 13。

## 发布课程章

```sh
mykaoyan publish "$SRC/课程/数学二/01-导数" --dry-run
mykaoyan publish "$SRC/课程/数学二/01-导数"
```

需要专用 `scope=publish` 的管理员令牌；普通进度令牌不能发布。CLI 按数学二或408下的章相对路径生成稳定标识，在“视频/字幕/讲稿”三个目录按同名 mp4/srt/md 配对。答案与不完整组合会跳过并报告，符号链接拒绝读取。dry-run 不联网；正式发布先准备计划再直传对象、登记、读回哈希。服务器只更新内容，已有上架状态保留，新内容默认下架；重复发布同内容不会增加版本或重复上传。章节路径改名会生成新标识，不会自动迁移旧内容。

发布成功 JSON：`{"published":[{"slug":"…","unchanged":false,"version":1,"listed":false,"keys":["…"],"cleanupPending":false,"publicationId":"…"}],"skipped":[]}`。若 cleanupPending=true，重新发布会重试旧对象清理；也可用发布令牌重试输出 publicationId 的 complete 接口。详细 R2 本机配置与验收边界见 `docs/ops/r2-publishing.md`。

## 代码结构

按 feature 分目录：每个目录承载一个关注点，依赖方向单向，只允许 feature → `auth` / `support`，`support` 不依赖任何 feature。`auth` 既是 `login` 的实现，也是 `progress`、`publish` 读取凭据的入口。

```
src/
  main.rs              进程外壳：参数分发、输出、退出码
  cli.rs               clap 命令定义，不含业务逻辑
  auth/
    mod.rs             Agent 令牌：login、读取、站点地址与凭据文件权限
  progress/
    mod.rs             pull / validate / push 编排
    api.rs             HTTP 与状态码映射
    state.rs           本地 ETag 边车
    contract.rs        进度契约校验
  publish/
    mod.rs             prepare → upload → complete → readback 编排
    scan.rs            章目录扫描与配对
    api.rs             发布接口
    upload.rs          预签名直传
    contract.rs        发布契约校验
  support/
    mod.rs             横切能力的模块声明
    schema.rs          随包公开契约的加载与校验原语
    private_file.rs    私有文件写入
```

feature 内部模块用 `pub(super)` 收口，跨 feature 只能看到 `auth::Config` 与 `support`；新增命令时只需在自己的目录里加模块，并在 `cli.rs` 与 `main.rs` 各挂一处分发。
