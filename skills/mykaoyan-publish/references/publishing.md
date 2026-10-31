# 发布流程

只在管理员发布时读取。命令默认在站主指定的私有目录运行；不要从公开仓库读取课程、讲义或试卷内容。

## 契约

- 公开契约：OpenAPI 3.2.0（JSON Schema 方言 2020-12）。
- 讲义 JSON Schema：<https://mykaoyan.cn/schemas/publish/v1/handout.schema.json>
- 试卷 JSON Schema：<https://mykaoyan.cn/schemas/publish/v1/paper.schema.json>
- CLI 的 `--dry-run` 用随包契约离线校验；服务端拒绝时先核对契约版本与内容，不绕过校验。

## 课程章

目录与配对规则：

- 章目录必须位于 `数学二/` 或 `408/` 下；章内固定三个子目录：`视频/`、`字幕/`、`讲稿/`。
- 按同名文件配对：`视频/<名>.mp4` + `字幕/<名>.srt` + `讲稿/<名>.md`；缺一个就跳过并报告。
- 章相对路径生成稳定标识；章节改名等于新章，不会迁移旧内容。
- 跳过：答案/解答/真题/answer/solution 等命名、不完整组合；符号链接拒绝读取。
- 文件上限：单个课程文件 5 GB；讲稿 ≤ 500000 字节（由 CLI 检查）。

```sh
mykaoyan --json publish <章目录> --dry-run
mykaoyan --json publish <章目录>
```

`--dry-run` 不联网，输出 `{"dryRun":true,"lessons":N,"skipped":[...]}`；预演只报告被跳过文件的名称与原因，不读取答案类文件内容，也不通过改名、换通道或标准输入绕过检查。正式发布依次执行 prepare → 预签名直传 → complete → readback，输出 `{"published":[{"slug","unchanged","cleanupPending","publicationId","version","listed","keys"}],"skipped":[...]}`。重复同内容不变版本、不重复上传；发布过程不改上架状态。

## 讲义（Markdown）

```sh
mykaoyan --json publish-handout <handout.md> --subject 408 --slug <slug> --title <标题> [--position N] --dry-run
mykaoyan --json publish-handout <handout.md> --subject 408 --slug <slug> --title <标题> [--position N]
```

- 单请求写入，不经对象存储；Markdown ≤ 1 MiB 且必须为 UTF-8；符号链接拒绝。
- 文件名或路径含「答案」「解析」「answer」「solution」直接拒绝，不读取内容。
- `--dry-run` 输出 `{"dryRun":true,"slug","bytes","contentHash"}`；成功输出 `{"slug","unchanged","listed","contentHash","updatedAt"}`。
- 重复同内容返回 `unchanged:true`，不写库；上架状态不变。

## 试卷（结构化 JSON）

```sh
mykaoyan --json publish-paper <paper.json> --dry-run
mykaoyan --json publish-paper <paper.json>
```

- 单文件 JSON：试卷元数据（科目、年份、slug、标题、来源说明、顺序）加 `questions` 数组；字段以 paper.schema.json 为准，不手抄 schema。
- 文件 ≤ 4 MiB，必须为合法 JSON；符号链接拒绝。
- 校验：题号唯一且严格升序；选择题（单选/多选）必须有 `options`；非选择题不得带 `options`。
- `--dry-run` 输出 `{"dryRun":true,"slug","questions","bytes","contentHash"}`；成功输出 `{"slug","unchanged","version","listed","contentHash","questionCount"}`。
- 题目整体替换；新试卷默认下架、版本 1，内容变化版本 +1，同内容 `unchanged:true` 且不写库。
- 题面公开，答案与解析只在登录后的单独答案页可见（`https://mykaoyan.cn/exams/<slug>/answers`）。只发布站主确认取得授权的真题。

## 错误与恢复

| 情况 | 处理 |
| --- | --- |
| 401 / 403 | 令牌缺失、无效，或用途/角色没有发布权限；停止，换正确的管理员令牌，不重试 |
| 409 | 发布冲突或对象校验失败；核对发布计划与内容，不自动重发 |
| 503 | R2 未配置；报告站主处理，不重试 |
| 上传失败 | 保留本地文件，不登记讲；重新检查后重新发布 |
| complete 结果未知 | 先读回同一 slug 的版本与 keys 核对；不要自行构造 HTTP 重试 |
| cleanupPending=true | 旧对象未删除；如实报告，重新发布同内容会重试清理 |
| 网络超时 | 可能已经写入；先读回核对，不直接重发 |

发布后读回 `slug`、`version`、`listed`、`keys`、`contentHash`，与 dry-run 的内容哈希对齐；失败或结果未知不得报告为成功。
