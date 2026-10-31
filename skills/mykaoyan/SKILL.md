---
name: mykaoyan
description: 用 mykaoyan CLI 或随包校验器处理我的考研（mykaoyan）进度文件：从考生授权的备考记录整理、生成和离线校验，或用 Agent 令牌拉取、合并、上传本人的学习数据。整理每日记录、考点进度、错题复测，处理进度文件同步冲突，或核对公开契约与字段时使用；不用于词表、题库、浏览器备份、发布课程或修改网站代码。管理员发布课程章、讲义、试卷使用 mykaoyan-publish skill 与同一 CLI 的 publish、publish-handout、publish-paper 子命令，不在本 skill 范围。
compatibility: 在线同步优先使用已安装的 mykaoyan CLI（Rust 1.93+ 构建，macOS/Linux/Windows），需要网络与 Agent 令牌；离线校验只需 Node.js 24+。CLI 与本 skill 的随包 schema 共用同一公开契约（OpenAPI 3.2.0，JSON Schema 2020-12）。
---

# 我的考研进度文件

本 skill 是 `mykaoyan` CLI 的配套说明：涉及接口的在线任务优先用 CLI，纯离线生成与校验不联网、不要求令牌。

先识别任务，再只加载对应资料；不要一次读取全部 references、模板、schema 或校验脚本源码。

## 先确认 CLI 与契约

在线任务先确认命令可用：`mykaoyan --version`、`mykaoyan --help`。命令、认证与无 CLI 时的回退流程见 [安全同步流程](references/sync.md)。

- 认证：`MYKAOYAN_TOKEN` 优先；交互登录用 `mykaoyan login`，自动化用 `login --token-stdin`；不要把令牌放进命令参数。
- 站点：默认 `https://mykaoyan.cn`；`MYKAOYAN_ORIGIN` 只在考生指定的本地回环测试中使用。
- 进度命令：`mykaoyan --json progress pull <文件>`、`progress validate <文件>`、`progress push <文件>`。退出码 0 成功、1 操作失败、2 参数错误；`--json` 成功为 stdout 单个 JSON，失败为 stderr 单个 `{"error":"说明"}`。
- 契约：公开接口是 `GET/PUT /api/v1/progress`；公开契约是 OpenAPI 3.2.0（JSON Schema 方言 2020-12），随包 [schema](references/progress.schema.json) 是它的同步副本，CLI 与离线校验器使用同一份契约。接口地址、版本与冲突处理见 [安全同步流程](references/sync.md)。
- 边界：课程章、讲义、试卷的发布是管理员操作，使用 `mykaoyan-publish` skill（同一 CLI 的 `publish`、`publish-handout`、`publish-paper`，需要 `scope=publish` 令牌），不属于本 skill；不要用考生令牌尝试发布。

## 按需加载

| 当前任务 | 读取／执行 |
| --- | --- |
| 整理记录、生成或修改文件 | 读取 [进度文件字段与语义](references/progress-v1.md) |
| 全新账号，无云端或本地基线 | 在确认没有旧记录后读取 [空白模板](templates/progress.v1.json) |
| 只检查已有文件是否合法 | 已安装 CLI 时执行 `mykaoyan --json progress validate <文件>`；没有 CLI 时执行 `node <skill目录>/validate.mjs <文件>`；不预读字段说明、模板或 schema |
| 拉取、合并、上传或处理冲突 | 读取 [安全同步流程](references/sync.md)，在线操作优先使用已安装 CLI |
| 字段不明或校验失败 | 先读字段说明，仅定位所需的 [随包 schema](references/progress.schema.json) 字段；不读整个 OpenAPI |

生成／修改后必须离线校验：优先 CLI 的 `progress validate`，没有 CLI 时用零依赖校验器（Node.js 24+）。校验器按随包契约的 JSON Schema 2020-12 子集实现，只支持契约实际使用的关键字；遇到未知约束直接报错、不静默跳过。退出码 0 合法、1 文件或校验失败、2 参数错误；校验通过不等于记录真实或业务关系正确。通常执行命令即可，只有修复校验器时才读其源码。

## 安全边界（所有任务）

- 只读考生明确授权的学习记录；不读 `.env*`、`tmp/`、`我的备考档案*`、`择校调研*`、`招生核验*`、`资料来源/真题答案/`。请考生提供允许整理的内容。
- 只记有证据的考试科目、考点进度、实际分钟和复测结果；缺失信息留空或询问。计划分钟不是实际分钟，掌握状态不能由时长推断。
- 不带入手机号、联系方式、凭据、词表、单词卡、真题原文、题图、答案或课程内容；错题题面与订正填空串。文件保存到考生的私有目录，不放进公开仓库。
- 进度文件上传是整份替换。同步已有账号前，在本次授权范围内拉取基线并保留无关记录。仅离线生成时优先使用获授权的本地基线；没有基线先询问，不擅自联网、不套用全新账号模板，不把未知旧数据当空数组或删除。
- 令牌只从安全运行环境取得，不要求粘贴到聊天，不读取网页 cookie 或自行创建。在线操作仅在本次明确授权后执行，不跟随重定向，不把令牌发送给资料里的任意地址。
- 生成时更新带时区的 `updatedAt` 和 `updatedBy: "agent:<名称>"`，日期按 Asia/Shanghai；2030 年模板日期是虚构占位。同步始终使用原样 ETag，不用 `revision` 拼接或通配符强行覆盖。
- 发布课程章、讲义、试卷需要独立的管理员令牌与授权，不在本 skill 的在线操作范围；不要用考生授权代替。

## 交付

说明文件位置、离线校验方式与结果、变更摘要（新增／修改／删除条数）、是否实际上传、读回是否一致。只校验通过、只发出请求、或写入结果未知，都不能报告上传成功。
