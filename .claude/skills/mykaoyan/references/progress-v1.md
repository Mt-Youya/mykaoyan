# 进度文件 v1 字段说明

准确的必填项、类型与格式以同目录 `progress.schema.json` 为准。所有对象拒绝未知字段。下表中 `?` 为可选，其余必填；文本可以为空串，但编号、名称与阶段名必须包含非空白字符。

## 顶层与通用类型

| 字段 | 含义 |
| --- | --- |
| `$schema?` | 公开 schema 地址；不改变校验器使用的随包契约 |
| `app` / `version` | 固定 `"mykaoyan"` / `1`，不兼容旧站文件 |
| `revision` | 非负整数；并发只认 GET 返回的 ETag，服务端写入后递增 |
| `updatedAt` | 带时区 ISO 时间，如 `2030-03-10T21:30:00+08:00` |
| `updatedBy` | `site`、`api` 或 `agent:<非空名称>`；服务器读回值可能重写 |
| `data` | `profile`、`progress`、`mistakes`、`daily`、`dayPlans`、`weekly` 六个字段必须全部存在 |

日期为真实日历中的 `YYYY-MM-DD`，不带时间，按上海日期理解。所有分钟、目标分与 revision 为非负整数。科目代码为三位数字**字符串**；分钟映射例：`{"302":60,"408":30}`，可以是 `{}`。所有时间戳都要带 `Z` 或 `±HH:MM` 时区。

## data 各类记录

### profile：备考档案

未建立时为 `null`，否则含：

- `examDate`：初试日期；未确认时不要猜。
- `subjects`：`{code, name, targetScore}` 数组。统考科目名称固定，自命题名称由考生提供；只写考生确认的科目。
- `otherMin`：每天不归入任何考试科目的固定分钟。
- `phases`：阶段数组；每项 `{name, start, end, weekday, weekend}`。工作日和周末都是 `{minutes, flexMin}`，分别保存各科计划分钟和弹性时间。

阶段按日期排列、结束不早于开始、互不重叠。不要将报考目标或浏览器草稿等额外字段塞入档案。

### progress：考点进度

每项 `{topicId, manual, updatedAt}`。`manual` 只允许：`untested`（未测）、`learning`（学习中）、`practiced`（已练）。待重测和稳定由错题推算，不写 `stable` 等派生值。学习分钟不能作为已练的证据。

### mistakes：错题与原始复测

| 字段 | 含义 |
| --- | --- |
| `id` | 错题编号，保留稳定编号，不因重复导入生成新编号 |
| `legacyId?` | 旧来源编号 |
| `subject` | 三位考试科目代码 |
| `topicId?` | 明确关联的考点编号，不能猜 |
| `source` | 来源元数据，如科目、年份、题号；不含题目全文 |
| `questionMd` / `correctionMd` | 格式要求的题面与订正文本槽位；本 skill 填 `""`，不上传题目和答案 |
| `attemptMd?` / `firstWrongStep?` / `keyCondition?` | 原始作答、第一处错误、关键条件；涉及题目或答案时省略 |
| `causes` | 错因数组：`concept` 概念、`condition` 条件、`calculation` 计算、`evidence` 依据、`misread` 审题、`strategy` 策略 |
| `correctedOn` | 实际订正日期 |
| `retests` | `{on, result}` 数组，按实际复测日期升序保存 |
| `createdAt` | 创建时间戳 |

复测结果：`independent` 独立完成、`with-hint` 提示后完成、`failed` 不会。第一次复测在订正日 +2 天；独立完成后第二次在该次复测日 +5 天；提示后完成或不会则从第一次复测重新开始。逾期仍等待作答，不能虚构失败记录。两次独立完成才稳定。这里只存实际记录，不写下一次日期、第几次或稳定状态。

### daily：每日记录

每项 `{date, minutes, done, tomorrowTop, retro}`：日期、实际各科学习时长、完成事项、明日首要任务、一句复盘。自由文本可为空；只写考生明确提供的内容，不夹带私有原文。每天最多一条，可补录过去日期。不能将计划分钟当作实际分钟。

### dayPlans：按天计划

每项 `{date, minutes, flexMin}`，覆盖该天默认的各科计划分钟和弹性时间。

### weekly：周复盘

每项 `{weekStart, nextWeekAdjustment}`。`weekStart` 必须是周一，只存考生写的下周调整，统计汇总由网站计算。

## 格式合法与内容可信

离线脚本遵循公开 schema 的结构、枚举、数值与日期格式约束；schema 尚不表达唯一编号、每天唯一、周一、阶段不重叠和复测的事实依据。整理时仍须遵守这些语义规则，不能把校验通过当成事实验证。

进度文件不包含词表、单词卡、复习记录或浏览器备份。确认没有记录的数组才用 `[]`；保留基线的其他记录，不用缺失资料推断删除。旧账号没有本地基线而只允许离线生成时，先请考生提供基线，或确认仅生成未合并候选；未知旧记录不能当成空数组。未合并候选不能直接上传，须另经授权拉取并合并。新增一个编号前先检查同类记录是否已有同一编号。
