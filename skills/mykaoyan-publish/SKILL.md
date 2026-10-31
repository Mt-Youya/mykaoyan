---
name: mykaoyan-publish
description: 站主（管理员）用 mykaoyan CLI 把课程章、Markdown 讲义、结构化真题试卷发布到 mykaoyan.cn：先 --dry-run 离线校验，再上传或单请求写入、登记并读回；发布只改内容、不改上架状态。发布课程视频/字幕/讲稿、讲义、真题试卷，或排查发布失败、409 冲突、cleanupPending 时使用。只用于管理员发布；不用于考生进度文件、词表、题库或修改网站代码。
compatibility: 需要已安装 mykaoyan CLI（Rust 1.93+，macOS/Linux/Windows）和 scope=publish 的管理员 Agent 令牌；发布需要网络。发布课程章还需要本地课程目录（视频/字幕/讲稿）。
---

# mykaoyan 管理员发布

本 skill 只服务站主/管理员。考生数据与进度文件用 `mykaoyan` skill；发布令牌与进度令牌分开，不能用考生的令牌发布。

## 先确认 CLI 与令牌

- `mykaoyan --version`、`mykaoyan --help` 确认命令面。
- 令牌：`MYKAOYAN_TOKEN` 环境变量优先；交互保存用 `mykaoyan login`，自动化用 `login --token-stdin`。令牌必须是管理员创建、`scope=publish`，不能写进命令参数或日志。
- 站点默认 `https://mykaoyan.cn`；`MYKAOYAN_ORIGIN` 只在本地回环测试使用。
- 公开契约是 OpenAPI 3.2.0（JSON Schema 方言 2020-12）；讲义/试卷 JSON Schema 见 [发布流程](references/publishing.md) 的契约一节，CLI 的 `--dry-run` 用同一契约离线校验。
- 输出：`--json` 成功为 stdout 单个 JSON，失败为 stderr 单个 `{"error":"说明"}`；退出码 0 成功、1 操作失败、2 参数错误。

## 命令入口

```sh
mykaoyan --json publish <章目录> --dry-run
mykaoyan --json publish-handout <handout.md> --subject 408 --slug <slug> --title <标题> --dry-run
mykaoyan --json publish-paper <paper.json> --dry-run
```

去掉 `--dry-run` 才正式发布；参数、输出字段与恢复流程见 [发布流程](references/publishing.md)。

## 红线（发布前必须确认）

- 只发布站主明确授权的内容：未取得授权的真题原文、答案、解析不上站；课程、讲义、试卷内容不进入公开仓库。
- 不发布答案类文件：文件名或路径含「答案」「解析」「answer」「solution」会被 CLI 拒绝；错题、答案、私有资料不要打包进发布物。
- 先 `--dry-run`：展示将发布与跳过的内容，站主确认后再去掉 `--dry-run` 正式发布。一次只做一类内容。预演时不要读取被排除文件（答案、解析、无关私有资料）的内容，也不要用改名、换通道或管道注入内容去试探绕过；只按文件名、目录结构和 CLI 的 skipped 报告说明原因。
- 发布不改变上架状态：新内容默认下架，已有状态保留；上架由站主另行处理，CLI 不提供上架命令。
- 401/403/409/503 不自动重试；409 先核对发布计划和内容，不换参数硬重发。失败可能已写入对象：先读回核对再决定。
- `cleanupPending=true` 要如实报告；重新发布同内容会重试旧对象清理。

## 按需加载

| 当前任务 | 读取／执行 |
| --- | --- |
| 发布课程章（视频+字幕+讲稿） | 读取 [发布流程](references/publishing.md) 的「课程章」一节 |
| 发布 Markdown 讲义（题面/速查表） | 读取 [发布流程](references/publishing.md) 的「讲义」一节 |
| 发布结构化真题试卷 | 读取 [发布流程](references/publishing.md) 的「试卷」一节 |
| 排查发布失败、409、cleanupPending | 读取 [发布流程](references/publishing.md) 的「错误与恢复」一节 |
| 核对公开接口与 JSON Schema | 读取 [发布流程](references/publishing.md) 的「契约」一节 |

## 交付

报告发布类型、dry-run 还是正式、每个对象的 slug 与 unchanged/version/listed/keys、跳过项、cleanupPending、是否读回一致；明确内容仍为下架（除非站主确认已上架）；不把失败、401/403/409/503 或结果未知报告为成功。
