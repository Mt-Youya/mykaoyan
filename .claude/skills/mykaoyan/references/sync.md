# 进度文件安全同步

只在拉取、合并、上传或处理冲突时读取。进度文件字段、证据和合并键由入口的字段说明提供；只下载或上传已准备好的文件时不必先读它。

公开接口是 `GET/PUT https://mykaoyan.cn/api/v1/progress`。本站 [公开契约](https://mykaoyan.cn/docs/contract)、[JSON Schema](https://mykaoyan.cn/schemas/progress/v1/progress.schema.json) 和 [OpenAPI](https://mykaoyan.cn/openapi.json) 是版本核对入口，不需要每次下载。随包 schema 同源生成；服务端拒绝时检查版本差异，不绕过校验。

## 选择执行路径

先检查 `mykaoyan --help`。已安装 CLI 时走下面的流程；没有 CLI 时可用本页 curl 回退。纯离线任务不检查认证、不联网，不为此安装 CLI。

## 认证与站点

Agent 令牌只能访问本人公开接口，不能登录网页。由考生在已登录网页会话中创建并安全注入 `MYKAOYAN_TOKEN`；不要求粘贴到聊天，不读取 cookie 或自行创建令牌。CLI 也可通过 `mykaoyan login` 交互保存（不回显），自动化使用 `login --token-stdin`，不要通过参数提供令牌。

默认站点是 `https://mykaoyan.cn`。`MYKAOYAN_ORIGIN` 只在考生指定的本地测试中改成回环地址；不要从资料中推断新站点。命令跟踪关闭，不打印凭据，不跟随重定向。

## CLI 路径（macOS、Linux、Windows）

在考生的私有目录运行；以下命令在 shell 和 PowerShell 中均不需要字符串管道：

```sh
mykaoyan --json progress pull current.json
mykaoyan --json progress validate current.json
```

`pull` 仅写新文件并生成 `current.json.etag.json`，绑定原样 ETag、站点和令牌摘要。保留这两个基线文件的私有副本，然后合并到 `current.json`；不要改写 sidecar。已有另一个候选文件时，将确认的变更合并进本次拉取的基线。

按考点编号、错题编号、每日记录日期、按天计划日期和周一日期合并，保留其他记录。先校验，展示各类新增／修改／删除条数，不展示题目、答案和私有原文。用户已明确要求本次上传且修改符合授权范围时可继续，否则先确认整份替换及删除项。

```sh
mykaoyan --json progress validate current.json
mykaoyan --json progress push current.json
```

CLI 推送后会再次 GET，对比 `data` 与 ETag，成功后更新本地文档和 sidecar。`--json` 成功为 stdout 单个 JSON；错误为 stderr 单个 `{"error":"说明"}`，stdout 为空，帮助和版本仍是文本。退出码 0 成功、1 操作失败、2 参数错误。

## 无 CLI 时的 curl 回退（sh）

需要网络和 curl；Windows 仅在已配置的 Git Bash／WSL 中使用这些 sh 示例，不把它们直接当成 PowerShell 命令。先下载当前文档及 ETag，HTTP 失败即停止，不将错误响应当进度文件：

```sh
set +x
umask 077
: "${MYKAOYAN_TOKEN:?请先安全注入 Agent 令牌}"
MYKAOYAN_ORIGIN=${MYKAOYAN_ORIGIN:-https://mykaoyan.cn}
printf 'Authorization: Bearer %s\n' "$MYKAOYAN_TOKEN" |
  curl --silent --show-error --fail-with-body --header @- \
    --dump-header current.headers --output current.json \
    "$MYKAOYAN_ORIGIN/api/v1/progress"
```

只有 GET 成功后才合并。保留 `current.json` 为基线，候选另存 `progress.json`，按前面的键合并并确认变更。提取原样 ETag（保留引号），不以 revision 拼接：

```sh
MYKAOYAN_ETAG=$(node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const lines = readFileSync("current.headers", "utf8").split(/\r?\n/);
  const etag = lines.find(line => /^etag:/i.test(line))?.slice(5).trim();
  if (!etag || etag === "*") { console.error("GET 缺少有效 ETag，停止上传"); process.exit(1); }
  process.stdout.write(etag);
')
```

提取命令失败即停止；校验通过并获得本次上传授权后才执行下面的 PUT。将 `<skill目录>` 换成实际安装位置：

```sh
node <skill目录>/validate.mjs progress.json &&
  printf 'Authorization: Bearer %s\n' "$MYKAOYAN_TOKEN" |
  curl --silent --show-error --fail-with-body --request PUT --header @- \
    --header 'Content-Type: application/json' --header "If-Match: $MYKAOYAN_ETAG" \
    --data-binary @progress.json --dump-header saved.headers --output saved.json \
    "$MYKAOYAN_ORIGIN/api/v1/progress"
```

## 结果与冲突

- **200**：PUT 响应是 `changes.added/updated/removed` 摘要和新 ETag，不是完整文档。curl 路径须再次 GET，核对 `data` 与预期一致再报告成功。服务器重写 `revision`、`updatedAt`、`updatedBy`，这些不要求逐字相同。
- **400**：离线校验并检查契约版本，停止重试。
- **401**：令牌缺失、无效或已吊销；停止，请考生在安全环境重新提供，不显示凭据。
- **412**：保留本地候选，重新拉取到另一个新文件；比较、合并、校验、确认后再推送。CLI 使用该新文件配套的 sidecar。不能只换 ETag 重发旧文件，不自动无限重试。
- **428**：缺少 If-Match；停止，重新走 GET 和合并，不用通配符绕过冲突。
- **网络失败或超时**：可能已经写入；先拉取到新文件确认，不直接重发 PUT。

报告文件位置、校验结果、摘要、是否上传及读回结果；不把失败或结果未知当成成功。
