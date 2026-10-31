# 规划 0005：用户上传扩展（视频、手稿、字幕与用户试卷）

状态：草稿（2026-10-31，内容类型、数据模型与权限矩阵已按站主决定成文；开放问题待站主确认后实施）。术语见 [GLOSSARY.md](../../GLOSSARY.md)，关键取舍见 [ADR 0017](../adr/0017-user-content-uploads.md)，实施工单从 `.scratch/mykaoyan-v1/issues/28-user-content-migrations.md` 起。本规格只写规格，不实现代码。

来源：站主 2026-10-31 决定——用户「投稿」就是用户上传的课程内容；在现有 mp4 视频之外，支持课程手稿（Markdown）、字幕（SRT/VTT），以及题目/试卷（题面+答案+解析）的上传。上传只要求登录；评论、评分、看答案要求有效会员；上传者在自己的投稿/试卷下免会员评论，并可查看自己试卷的答案；其他功能不设会员门。

## 1. 现状与范围

现状（2026-10-31，本机实现，生产未迁移）：

- `submissions` 只有视频投稿：R2 分片直传（8 MiB 固定片、≤ 500,000,000 字节）、mp4/H.264、≤ 1800 秒；状态 `uploading → pending → approved / rejected`，驳回满 30 天清理 R2 对象（[ADR 0013](../adr/0013-submission-multipart-lifecycle.md)）；评分与推荐按 [ADR 0014](../adr/0014-rating-aggregation.md) 实时聚合；上传与审核由默认关闭的 `COMMUNITY_ENABLED` 控制。服务端上传只要求登录，但现有网页仍按「会员」展示上传入口，需在本规格实施时修正。
- `papers` + `paper_questions` 已由管理员 CLI 发布真题试卷，`papers.owner_account_id` 记录发布者；公开接口不含答案，`GET /api/papers/{slug}/answers` 按「有效会员 / 试卷上传者本人 / 管理员」放行（[ADR 0016](../adr/0016-past-paper-publishing.md)）。`listing_changes` 已支持 `paper` 上下架审计。
- 评论目前只挂讲；投稿评论由 ticket 27 以 `submission_comments` / `submission_comment_deletions` 实现（本机已实现；Postgres 集成测试与真机验收待环境），权限规则与本规格 §6 一致。用户试卷评论尚未实现。
- 公开契约（[ADR 0006](../adr/0006-public-contract-from-zod.md)）只覆盖进度文件与管理员发布接口；用户上传走网页会话，不进 OpenAPI/CLI。

本规格的目标：

1. 登录账号在社区开放时可以上传视频（已有）、手稿（Markdown）、视频字幕（SRT/VTT），并提交题目/试卷（题面+答案+解析）。
2. 用户内容一律先审后发；审核、上下架、审计与社区开关复用现有投稿模型，用户试卷默认下架。
3. 权限按 §6：上传只要求登录，评论/评分/看答案要求会员，上传者有本人内容下的评论例外与本人试卷的答案例外。
4. 答案隔离不因 UGC 放松：题面公开，答案与解析只在单独答案页出现，不进入题面页、列表、摘要、站内搜索、OG 卡片与 sitemap。
5. 不新增 R2 对象类型，不给用户内容引入转码、DRM、在线判分等新链路。

## 2. 术语与内容边界

- **投稿**：登录账号上传的一份课程材料（视频或手稿），必须标明考试科目，可选考点；先进入审核，审核通过并由管理员上架后其他人才能看到。
- **手稿**：投稿的一种，Markdown 格式的课程文字材料，不带视频。手稿不是讲稿：讲稿随站主发布的讲出现，手稿是用户投稿。
- **字幕**：随视频投稿一起提交的 SRT 或 VTT 文字轨，最多两条；不是独立投稿，脱离视频不能单独发布。
- **用户试卷**：登录账号上传的一套题目，含题号、题型、分值、题面、选项（选择题）、答案、解析与考点；先进入审核。题面公开，答案与解析只在单独答案页可见。用户试卷是用户内容，**不等同**于站主确认取得授权的真题。
- **审核 / 上架**：沿用 GLOSSARY。审核是管理员对投稿或用户试卷「通过 / 驳回」；上架是内容对访客可见的状态，只有管理员能改变。

内容边界（沿用 [PLAN.md](../PLAN.md) §2 红线）：

- 未取得授权的真题原文、题图、真题答案不得上传、不得审核通过、不得进入站点与仓库。
- 审核通过不代表授权确认；授权与合规责任仍由运营者承担（[ADR 0005](../adr/0005-accepted-compliance-risks.md)、[ADR 0016](../adr/0016-past-paper-publishing.md)）。
- 答案不进入题面页、列表、摘要、站内搜索、OG 卡片与 sitemap。
- 任何用户内容、真实题目或答案都不进入仓库；测试与 fixture 只用虚构内容。

## 3. 内容类型

| 类型 | 形态 | 主内容存储 | 关键限制 |
| --- | --- | --- | --- |
| 视频投稿（`kind='video'`） | 一段 mp4/H.264 视频 | R2 私有桶，key 由服务端生成：`submissions/{服务器随机 UUID}/video.mp4` | ≤ 500,000,000 字节、≤ 1800 秒；8 MiB 固定分片，可断点续传；沿用现有流程 |
| 视频字幕（0–2 条） | SRT 或 VTT 文本 | Postgres 表 `submission_subtitles`，只存归一化后的 VTT 正文 | 每条 ≤ 262,144 字节；同一视频投稿最多 2 条且语言不重复；不产生 R2 对象 |
| 手稿投稿（`kind='manuscript'`） | Markdown 文本 | Postgres 表 `submissions.manuscript_markdown` | 1–1,000,000 字符且 UTF-8 不超过 1,048,576 字节；无视频、无字幕 |
| 用户试卷 | 元数据 + 1–50 道结构化题目 | Postgres 表 `papers` + `paper_questions`（与站主真题同一套结构） | 单题字段沿用发布契约上限；整卷题面+答案+解析 UTF-8 合计 ≤ 512 KiB；无文件上传、无 R2 对象 |

不是本规格的内容类型（见 §12）：独立字幕投稿、PDF/图片/Office 文件、封面图、音频、做题判分、视频转码与 DRM、题目自动拆解。

## 4. 数据模型

### 4.1 `submissions`：按 `kind` 扩展单表，不新建课程材料表

审核、上架、评分、社区开关、清理、归属与举报路径都是「投稿」的共享行为；按内容类型分表会复制这些行为两遍。因此仍只有一张 `submissions` 表，用 `kind` 区分形态，形态专属列可空，并由数据库 check 按 `kind` 收紧。

迁移（`packages/db/supabase/migrations`，沿用 Supabase 时间戳前缀）：

| 字段 | 变更 | 约束 |
| --- | --- | --- |
| `kind` | 新增 `text not null default 'video'` | check：`video` / `manuscript`；迁移把既有行回填为 `video`，之后不可改 |
| `manuscript_markdown` | 新增 `text` | 手稿正文；`kind='manuscript'` 时非空（被清理后可空，见下） |
| `size` | `not null` 改为可空 | 视频为字节数（1–500,000,000）；手稿为 `null`，字节数由 `octet_length(manuscript_markdown)` 计算 |
| `duration` | `not null` 改为可空 | 仅视频：0 < duration ≤ 1800；手稿为 `null` |
| `object_key` | `not null` 改为可空（`unique` 保留，Postgres 允许多个 `null`） | 仅视频非空且由服务端生成；手稿为 `null` |
| `upload_id` | 不变（可空） | 仅视频可能非空；手稿恒为 `null` |
| `fingerprint` | 保持非空 | 视频为文件 SHA-256；手稿为服务端计算的 Markdown SHA-256（十六进制小写 64 位） |

用一条按 `kind` 收紧的 check 替换现有 `submissions_limits`：

- `kind='video'`：`size`、`duration`、`object_key` 非空且满足原有上限；`manuscript_markdown` 为 `null`。
- `kind='manuscript'`：`size`、`duration`、`object_key`、`upload_id` 为 `null`；`status <> 'uploading'`（手稿单请求写入，直接为 `pending`）；`manuscript_markdown` 非空且 `length` 1–1,000,000、`octet_length` 1–1,048,576，或已被清理（`deleted_at` 非空）。
- 既有 `submissions_state`、`submissions_visibility`、`submissions_review` 三条 check 不变；`deleted_at` 语义扩展为「原文件或正文已清理」，被清理后不可播放、不可阅读正文，审核记录保留。

新增索引：`(subject_code, kind, status, listed, created_at)` 供科目页按形态筛选；既有索引保留。

### 4.2 新表 `submission_subtitles`

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | uuid | 主键，`gen_random_uuid()` |
| `submission_id` | uuid | 外键 → `submissions(id)`，`ON DELETE cascade` |
| `language` | text | 语言标签，`^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$`，如 `zh`、`zh-Hans`、`en` |
| `label` | text | 显示名，1–50 字符，如「中文（简体）」 |
| `source_format` | text | 上传时的格式：`srt` / `vtt` |
| `vtt_content` | text | 归一化后的 VTT 正文，非空 |
| `bytes` | integer | `octet_length(vtt_content)`，1–262,144 |
| `created_at` / `updated_at` | timestamptz | 默认 `now()` |

约束：`unique(submission_id, language)`；check 语言、`label`、`bytes`、`source_format`；一个投稿最多 2 条由服务层在同一事务内校验。启用 RLS，并对 `anon` / `authenticated` 撤权，只经 API 服务层访问（与既有表一致）。

### 4.3 用户试卷：复用 `papers` + `paper_questions`

答案隔离、题面页、答案页与逐题结构已经存在（[ADR 0016](../adr/0016-past-paper-publishing.md)），用户试卷不新造一套题目模型；只给 `papers` 增加「来源」与「审核」两组字段，把「站主授权发布的真题」和「用户上传的试卷」区分开。

| 字段 | 变更 | 约束 |
| --- | --- | --- |
| `origin` | 新增 `text not null default 'admin'` | check：`admin` / `user`；既有行回填 `admin` |
| `review_status` | 新增 `text not null default 'approved'` | check：`pending` / `approved` / `rejected`；既有行回填 `approved` |
| `reviewed_at` | 新增 `timestamptz` | 用户试卷审核时间 |
| `reviewer_id` | 新增 `uuid` | 外键 → `accounts(id)`，`ON DELETE set null` |
| `review_reason` | 新增 `text` | 驳回原因，1–500 字符；通过时为 `null` |
| `rights_confirmed_at` | 新增 `timestamptz` | 用户提交时勾选权利声明的记录时间；`origin='admin'` 时可为 `null` |

新增 check：

- `origin='admin'` 时 `review_status='approved'`，`reviewed_at` / `reviewer_id` 可为空（管理员发布路径不经过审核）。
- `origin='user'` 时 `rights_confirmed_at` 非空。
- `origin='user'` 且 `review_status='pending'` 时 `reviewed_at`、`reviewer_id` 为空；`review_status='approved' / 'rejected'` 时二者非空，且 `rejected` 必须带 1–500 字符的 `review_reason`。
- `listed=true` 必须 `review_status='approved'`。

用户试卷的写入规则：

- 服务端生成 `slug`：`u-` + 12 位小写十六进制随机串（如 `u-3f9a1c02b7de`），全局唯一；不接受客户端指定 slug，避免与站主真题抢名或冒名。
- `position=0`；`content_version=1`；`content_hash` 为服务端对规范化提交输入的 SHA-256，用于审计，不对外开放成版本号。
- `owner_account_id` = 提交账号；发布路径之外的字段（题目）整体写入，提交后不可编辑。
- 用户试卷不参与评分（评分表的外键指向 `submissions`，试卷没有评分口径）；可以评论（§6、§4.4）。

新增索引：`(origin, review_status, subject_code, year, position)`；`(owner_account_id, created_at desc)`。

### 4.4 评论目标扩展

- 讲评论表 `comments` 与已验收逻辑不改。
- 投稿评论由 ticket 27 实现：`submission_comments`（父评论复合外键限定同一投稿）、`submission_comment_deletions`（删除审计）、复用 `comment_keywords`；接口 `GET/POST /api/submissions/:id/comments`、`GET/DELETE /api/admin/submission-comments`。本规格只约束其权限规则（§6），不重复实施。
- 用户试卷评论新增 `paper_comments` / `paper_comment_deletions`，结构与投稿评论一致（父评论复合外键限定同一试卷、正文 1–2000 字符、一层回复、删除审计），复用 `comment_keywords`；接口 `GET/POST /api/papers/:slug/comments`、`GET/DELETE /api/admin/paper-comments`。两套评论都启用 RLS 并对公开角色撤权。

### 4.5 公开视图

- `Submission` 增加 `kind`（`video` / `manuscript`）；手稿额外返回 `manuscriptBytes`，正文由 `GET /api/submissions/:id/manuscript` 提供（见 §8.1），列表不返回正文全文。
- `OwnSubmission` 增加 `kind`、`hasSubtitles`、`subtitleLanguages`、`manuscriptBytes`；清理后返回 `deleted=true`、正文不可读。
- `PaperSummary` / `PaperDetail` 增加 `origin`（`admin` / `user`）；答案字段仍只出现在答案接口，题面详情不返回 `answerMarkdown` / `analysisMarkdown`。
- 所有用户内容 DTO 不返回文件指纹、对象 key、完整账号编号或审核原因（本人/管理员视图除外，沿用既有规则）。

## 5. 存储、校验与限制

### 5.1 视频与 R2

沿用现有实现，不改变对象 key 规则：对象 key 由服务器随机分配（`submissions/{随机 UUID}/video.mp4`），客户端不能指定 key 或 R2 上传编号；8 MiB 固定分片、单文件 ≤ 500,000,000 字节、≤ 1800 秒；预签名 URL 有效 15 分钟；完成时以 R2 ListParts 与 HEAD（大小、`video/mp4`）为准再登记为 `pending`。清理顺序固定为「先写库标记、再删 R2 对象」，删除失败保留标记重试（[ADR 0013](../adr/0013-submission-multipart-lifecycle.md)）。

### 5.2 手稿与字幕进 Postgres，不新建 R2 对象

手稿与字幕是纯文本、体积小、需要参与事务与审核一致性，而且不需要 HTTP Range、转码或断点续传。按 [ADR 0015](../adr/0015-handout-publishing.md) 的先例，一次请求直接写库：没有发布计划表、没有预签名、没有对象清理；代价是数据库体积，见 §13 开放问题。

- 手稿正文只存在 `submissions.manuscript_markdown`；读取由 API 返回，渲染复用现有 `Markdown` 组件（GFM + KaTeX，不渲染原始 HTML）。UGC Markdown 不自动加载远程图片，图片/附件托管不在本规格内（仅保留为链接）。
- 字幕只在提交或编辑窗口内写入；服务端解析 SRT/VTT，校验后统一转成 VTT 保存，播放时直接返回 VTT。SRT 的序号行、逗号小数点与自动换行由归一化处理；不接受 ASS/SSA、图片字幕或二进制字幕。

### 5.3 逐类校验

| 类型 | 上传前（浏览器） | 服务端 |
| --- | --- | --- |
| 视频 | 读取容器轨道与时长，检查 mp4/H.264、大小、时长；逐片 SHA-256 生成文件指纹 | 会话、社区开关与归属；分片签名绑定对象/编号/长度；完成后 HEAD 大小与类型；服务端不转码、不下载媒体流验证编码，由管理员预览审核 |
| 字幕 | 读取文本，检查 UTF-8、格式、大小、条数与语言 | 严格解析时间轴：SRT/VTT 结构、每条 `start < end`、非负时间、cue 数 ≤ 5000、正文 UTF-8 且 ≤ 262,144 字节、总时长不超过视频时长；归一化为 VTT；同一投稿最多 2 条、语言不重复 |
| 手稿 | 显示字符数与 Markdown 预览；检查 UTF-8 | 标题 1–200、简介 ≤ 2000、科目为三位数字、考点属于该科目；正文 1–1,000,000 字符且 UTF-8 ≤ 1,048,576 字节；去掉 NUL；服务端计算指纹；不得为空 |
| 用户试卷 | 表单逐题校验并显示总字数；可从 JSON 文件导入后再校验 | 科目、年份 2000–2100、标题 1–200、来源/权利说明 1–500、`rightsConfirmed` 必须为 `true`、题数 1–50、题号唯一且严格升序、题型在枚举内、选择题必须有 2–8 个 A–H 选项而其他题型不得带选项、单题题面/答案/解析 ≤ 50,000 字符、整卷题面+答案+解析 UTF-8 合计 ≤ 512 KiB；`slug` 与 `position` 由服务端生成，客户端提交即 400 |

通用：所有写接口从会话取身份，不接受客户端账号编号；JSON 请求体沿用 API 现有 2 MB 上限（手稿加元数据、字幕两条、用户试卷 512 KiB 均在限制内）；错误统一 `application/problem+json`。

### 5.4 清理与保留

- 视频投稿：驳回满 30 天后，先标记 `delete_marked_at`，删除 R2 对象成功后再记 `deleted_at`；同一批清理删除该投稿的字幕行（字幕正文属于内容，不保留）。失败保留标记，下次重试；管理员可手动重试。生产启动时与每小时一批 50 条，沿用现有实现。
- 手稿投稿：驳回满 30 天后，在同一事务中清空 `manuscript_markdown` 并写 `deleted_at`，保留投稿元数据、审核记录与驳回原因；清理后正文不可读、不可再上架。
- 用户试卷：没有 R2 对象，驳回后不自动清理正文；内容保持仅本人/管理员可见、永不上架。彻底删除与保留期限见 §13。
- 清理后公开列表、详情、字幕、播放令牌都不可用；本人与管理员仍可看到「已清理」状态与审核记录。

## 6. 权限矩阵

角色：访客（未登录）、登录账号（含非会员与过期会员）、有效会员、上传者本人（仅对本人内容）、管理员。

| 能力 | 访客 | 登录账号（非会员） | 会员 | 上传者本人 | 管理员 |
| --- | --- | --- | --- | --- | --- |
| 浏览已上架课程材料（视频/手稿）与字幕 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 浏览已上架试卷的题面（真题与用户试卷） | ✓ | ✓ | ✓ | ✓ | ✓ |
| 上传视频、手稿，提交用户试卷（社区开放时） | — | ✓ | ✓ | ✓ | ✓ |
| 查看自己的投稿/试卷（含未上架、驳回原因、清理状态） | — | ✓（仅本人） | ✓（仅本人） | ✓ | ✓（全部） |
| 评论与一层回复（讲、投稿、用户试卷） | — | — | ✓ | ✓（在自己的投稿/试卷下免会员） | ✓ |
| 阅读评论 | ✓（仅已上架内容） | ✓ | ✓ | ✓ | ✓ |
| 评分（课程材料投稿） | — | — | ✓（不能给自己评分） | —（不能给自己评分） | ✓（须有效会员，不能给自己评分） |
| 查看答案与解析（真题与用户试卷） | — | — | ✓ | ✓（仅自己的试卷） | ✓ |
| 审核、上下架、删评论、关键词维护、清理到期文件 | — | — | — | — | ✓ |

补充规则：

- **上传只要求登录**：不要求会员期；会员到期不影响继续上传，也不影响历史投稿与本人试卷的答案预览。
- **评论例外**：上传者本人在自己的投稿、自己的用户试卷下发表评论与回复免会员；例外只按「当前会话账号 = 内容上传者（所有者）」判断，不按会员期。讲没有上传者，不适用例外。
- **答案例外**：试卷答案只对有效会员、试卷上传者本人、管理员放行；上传者例外只覆盖本人试卷，不覆盖他人试卷。
- **评分例外不存在**：上传者不能给自己的投稿评分；管理员也必须持有有效会员期且不能给自己的投稿评分（[ADR 0014](../adr/0014-rating-aggregation.md) 不变）。
- 会员资格逐次按会员期计算，不存「是否会员」字段；到期后不能再评论、评分、看他人试卷答案，已有内容与评分保留。
- 所有用户内容受默认关闭的 `COMMUNITY_ENABLED` 控制：关闭时公开列表为空、新上传/新评论/新评分被拒绝、用户试卷的公开详情与答案对非本人返回 404；本人与管理员仍可预览、审核与下架，关闭期间不能上架。已签发的短时播放/上传凭证到期前不能撤销。
- 上传者本人不能批准、下架或删除自己的内容；审核与处置只由管理员执行。
- Agent 令牌不能上传、评论、评分或看答案；用户内容接口只接受网页会话。

## 7. 审核、上下架与清理

### 7.1 状态机

课程材料（视频与手稿）：

- 视频：`uploading`（上传未完成）→ `pending`（待审核）→ `approved` / `rejected`。手稿单请求写入，直接 `pending`。
- 审核通过：记录 `reviewed_at`、`reviewer_id`；社区开放时同时 `listed=true`，关闭时仅记为已通过、保持未上架，开放后由管理员单独上架。
- 审核驳回：必须写 1–500 字符原因，`listed=false`；原因对本人可见，不进入公开接口。
- 重复审核（已审核内容再次审核）返回 409，不覆盖审核记录。
- 上架/下架：管理员接口写 `listing_changes` 审计；上架要求 `status='approved'` 且未标记清理；社区关闭时不能上架。

用户试卷：

- `pending`（提交后默认）→ `approved` / `rejected`。
- 通过：记录 `reviewed_at`、`reviewer_id`；社区开放时同时 `listed=true`，关闭时保持未上架。
- 驳回：必须写原因，`listed=false`；记录保留，本人可见原因。
- 上架/下架复用 `PUT /api/admin/papers/{slug}/listing` 与 `listing_changes`（`target_type='paper'`）。新增守卫：`origin='user'` 的试卷只有 `review_status='approved'` 且社区开放时才能上架；`origin='admin'` 的真题发布路径与现有行为不变。
- 用户试卷提交后不可编辑、不可撤回；被驳回后重新提交会生成新试卷（新 slug），旧记录保留。

### 7.2 审计与合规

- 审核记录（通过/驳回、管理员、时间、原因）与 `listing_changes` 上下架审计分开保留，不互相覆盖。
- 用户试卷提交时记录 `rights_confirmed_at`（提交页勾选「本人拥有或已获授权」）；手稿与视频依赖用户协议 + 管理员审核，不新增逐条权利声明字段。
- 审核通过不改变授权责任；未授权内容即使上传成功也应驳回并下架。
- 违规内容的举报、申诉与彻底删除流程见[法律与反馈说明](../ops/legal-and-feedback.md)与 [ADR 0005](../adr/0005-accepted-compliance-risks.md)，不在本规格展开。

## 8. 接口

所有用户内容接口使用网页会话（一方 cookie），不接受 Agent 令牌；分页从 0 开始、每页 50 条、返回 `hasMore`；未登录 401、已登录无权限 403、不存在或别人的资源 404、状态冲突 409、参数无效 400；错误体为 `application/problem+json`。

### 8.1 课程材料

| 接口 | 认证 / 权限 | 行为 |
| --- | --- | --- |
| `POST /api/submissions/uploads` | 登录；社区开放 | 现有视频投稿：初始化或按原 `id` 恢复；返回本人视图 |
| `GET /api/submissions/:id/upload` | 本人 | 现有视频上传进度与已存分片 |
| `POST /api/submissions/:id/parts/:number` | 本人 | 现有分片签名，15 分钟有效 |
| `POST /api/submissions/:id/complete` | 本人 | 现有完成登记，核验后进入 `pending` |
| `POST /api/submissions/manuscripts` | 登录；社区开放 | 新：单请求提交手稿。请求含 `id`（客户端 UUID，用于幂等重试）、`kind='manuscript'`、标题、简介、科目、可选考点、`manuscriptMarkdown`；写入即 `pending`，服务端计算指纹与字节数；相同 `id` 幂等返回同一条记录，内容不一致 409 |
| `PUT /api/submissions/:id/subtitles` | 本人；`pending` / `uploading` 且未审核 | 新：整体替换字幕（0–2 条）。请求含 `tracks[]`（`language`、`label`、`format`、`content`）；服务端校验并归一化 VTT；已审核后返回 409 |
| `DELETE /api/submissions/:id/subtitles/:language` | 本人；未审核 | 新：删除一条字幕 |
| `GET /api/submissions/:id/subtitles/:language` | 公开（已上架且社区开放）或本人/管理员 | 新：返回 `text/vtt; charset=utf-8`、`X-Content-Type-Options: nosniff`、`Cache-Control: no-store`；未上架且非本人/管理员 404 |
| `GET /api/submissions/:id/manuscript` | 公开（已上架且社区开放）或本人/管理员 | 新：返回 `{ markdown }`，`Cache-Control: no-store`；未上架且非本人/管理员 404；已清理 404 |
| `GET /api/submissions?subject=302&topic=&kind=&page=0` | 公开 | 现有列表：只返回已通过且上架的投稿；新增 `kind` 筛选（可选 `video` / `manuscript`，缺省全部）与返回 `kind` |
| `GET /api/submissions/mine?page=0` | 本人 | 现有我的投稿：任何状态可读；新增 `kind`、字幕摘要、手稿字节数、清理状态 |
| `POST /api/submissions/:id/playback-token` | 公开（已上架）或本人/管理员 | 现有播放令牌；`kind='manuscript'` 返回 409「手稿没有播放令牌」 |
| `GET/POST /api/submissions/:id/comments`、`GET/DELETE /api/admin/submission-comments` | 见 §6 | 投稿评论，由 ticket 27 实现 |
| `GET /api/admin/submissions?page=0` | 管理员 | 现有审核列表：新增 `kind`、`subtitleCount`、`hasManuscript`，手稿可直接预览正文 |
| `POST /api/admin/submissions/:id/review` | 管理员 | 现有审核：手稿与视频共用；`{decision:'approve'}` 或 `{decision:'reject',reason}` |
| `PUT /api/admin/submissions/:id/listing` | 管理员 | 现有上下架，规则见 §7.1 |
| `POST /api/admin/submissions/cleanup` | 管理员 | 现有清理：视频删对象与字幕，手稿清空正文 |

### 8.2 用户试卷

| 接口 | 认证 / 权限 | 行为 |
| --- | --- | --- |
| `POST /api/papers/submissions` | 登录；社区开放 | 新：提交用户试卷。请求为 `SubmitPaper`（科目、年份、标题、来源/权利说明、`rightsConfirmed:true`、1–50 题）；服务端生成 `slug` 与 `position`，写入 `papers`/`paper_questions`，`origin='user'`、`review_status='pending'`、`listed=false`、`owner_account_id=当前账号`、`rights_confirmed_at=now()`；返回 `slug`、状态与题数；无并发覆盖问题（每次新记录） |
| `GET /api/papers/mine?page=0` | 本人 | 新：我的用户试卷列表，含审核状态、驳回原因、题数、时间 |
| `GET /api/papers/mine/:slug` | 本人 | 新：本人试卷全文（含答案与解析），`Cache-Control: no-store`，用于提交后预览与查看驳回原因；必须注册在 `GET /api/papers/:slug` 之前 |
| `GET /api/papers?subject=302&origin=admin` / `origin=user` | 公开 | 扩展：列表默认 `origin=admin`（真题区行为不变）；`origin=user` 只返回已通过且上架的用户试卷，社区关闭时为空；返回 `origin` |
| `GET /api/papers/:slug` | 公开 | 扩展：题面详情，不含答案；`origin=user` 时要求已通过、已上架且社区开放，否则 404；返回 `origin` |
| `GET /api/papers/:slug/answers` | 登录 | 扩展：试卷存在且可见（已通过+上架；用户试卷还要求社区开放）或本人/管理员；未登录 401；非会员且非本人/管理员 403；未上架/不存在 404；`Cache-Control: no-store`；用户试卷的答案页标注「用户投稿」 |
| `GET/POST /api/papers/:slug/comments`、`GET/DELETE /api/admin/paper-comments` | 见 §6 | 新：用户试卷评论（会员或上传者本人可写，访客可读已上架试卷评论，管理员可删） |
| `GET /api/admin/papers?status=pending&page=0` | 管理员 | 新：用户试卷审核列表（可按状态筛选），含来源账号与提交时间 |
| `GET /api/admin/papers/:slug` | 管理员 | 新：含答案与解析的完整试卷，供审核预览；`no-store` |
| `POST /api/admin/papers/:slug/review` | 管理员 | 新：`{decision:'approve'}` 或 `{decision:'reject',reason}`；只处理 `pending`；社区开放时通过即上架；重复审核 409 |
| `PUT /api/admin/papers/:slug/listing` | 管理员 | 现有：新增用户试卷守卫（§7.1）；真题行为不变 |

### 8.3 契约（zod 单一来源）

- `packages/core` 新增：`SUBMISSION_KINDS`、`manuscriptSubmissionInputSchema`、`submissionSubtitleTrackSchema` / `putSubmissionSubtitlesSchema`、`submitPaperSchema`（复用 `paperQuestionSchema`，题数 1–50）、`paperReviewSchema`、`paperReviewResultSchema` 与相应常量（手稿字符/字节上限、字幕字节上限、用户试卷整卷字节上限）。
- 这些用户接口属于网页会话 API，**不进入公开 OpenAPI / JSON Schema**（公开契约仍只覆盖进度文件与管理员发布接口，ADR 0006）；Web 与 API 共用 `packages/core` 的同一份 zod 定义，避免两端规则漂移。以后若为 CLI/Agent 开放用户提交，再按 ADR 0006 生成契约。
- CLI 契约（`cli/contracts/openapi.json`）与管理端契约生成物不变，CI 重新生成后必须无差异。

### 8.4 CLI

- CLI 不新增用户上传命令。理由：用户上传需要网页会话、交互式权利声明与文件预览；Agent 令牌目前只有 `progress` 与 `publish` 两种用途，用户上传若走 CLI 会引入第三种权限面，收益不足。
- 管理员 CLI（`publish`、`publish-handout`、`publish-paper`）保持不变，仍只用于站主发布；用户试卷的审核在网页管理页完成。
- 将来若需要 `mykaoyan submit`，须先设计 `scope=submit` 的账号令牌、权限边界与契约版本，见 §13。

## 9. 前端页面

### 9.1 科目页的投稿面板（现有 `SubmissionsPanel` 扩展）

- 上传入口改为「登录即可」：访客显示登录引导；已登录的非会员也可以打开上传表单；会员说明只保留给评论、评分、看答案。修正现有 `MembershipAction` 把投稿入口锁在会员之后的行为。
- 表单按 `kind` 切换：
  - 视频：现有字段 + 可选字幕管理（添加最多 2 条 SRT/VTT、语言与显示名、逐条校验、删改仅限审核前）。
  - 手稿：标题、简介、考试科目、可选考点、Markdown 编辑区（字符数、预览）、提交后直接进入待审核。
- 公开列表：按 `kind` 显示标签；视频卡片保留播放器与字幕轨；手稿卡片提供「阅读手稿」展开区（复用 `Markdown` 组件），不加载远程图片。
- 评分、投稿评论入口按 §6 展示；上传者本人看到「本人上传」提示与免会员评论入口；访客可读评论。
- 「我的投稿」显示形态、状态、驳回原因、字幕数量、清理状态；续传只对 `kind='video'` 且 `uploading` 的记录显示。

### 9.2 用户试卷

- `/community/papers`：用户试卷列表（按考试科目筛选，显示标题、年份、题数、审核通过标识与「用户投稿」字样）；与 `/exams` 的真题列表分开，不混列。
- `/community/papers/new`：提交页。逐题表单（题号、题型、分值、考点、题面、选项、答案、解析，可增删题）为主；支持导入符合 `SubmitPaper` 的 JSON 文件后在浏览器校验再提交。必须有权利声明勾选（「本人拥有或已获授权」）；显示整卷字节数与限制。
- `/community/papers/$slug`：题面页，逐题显示题面与选项，不含答案；底部「查看答案与解析」入口按会员/上传者/管理员状态分流；未登录先登录，非会员显示会员入口，上传者本人可直接进入。
- `/community/papers/$slug/answers`：答案页，逐题显示答案与解析；`noindex`，不进入 sitemap；答案字段不进入题面页、列表、OG 卡片与站内搜索。
- 「我的试卷」：本人列表与状态、驳回原因、题数；未上架时仅本人可见，附「等待审核 / 已驳回 / 已上架」提示。
- `/exams` 保持站主真题列表；可在页面说明处提供「用户投稿试卷」入口，但不把用户试卷混入真题列表。

### 9.3 管理后台（`/admin/content`）

- 投稿审核扩展：列表显示 `kind`、字幕数、手稿预览；审核通过/驳回、上下架、清理入口沿用现有交互。
- 新增「用户试卷审核」：待审列表、完整试卷预览（含答案与解析）、通过/驳回（驳回必须填原因）、上下架切换（受 §7.1 守卫）；社区关闭时显示「审核通过但暂不上架」说明。
- 权限沿用：管理员会话 + 数据库当前角色复核；未登录 401、普通账号 403。

## 10. 迁移、实施与测试

### 10.1 迁移顺序

1. 新增 `submissions.kind` / `manuscript_markdown`，放宽 `size` / `duration` / `object_key` 为可空，替换上限 check，回填既有行为 `kind='video'`。
2. 新增 `submission_subtitles`（RLS、撤权、外键、唯一约束）。
3. 扩展 `papers`（`origin`、`review_status`、`reviewed_at`、`reviewer_id`、`review_reason`、`rights_confirmed_at`）与索引，回填既有行为 `origin='admin'` / `review_status='approved'`，新增 check。
4. 新增 `paper_comments` / `paper_comment_deletions`（RLS、撤权、父评论复合外键）。
5. 迁移只在本机专用临时 Postgres 从空库重放；生产迁移需站主批准后按既有流程执行。

ticket 27 的 `submission_comments` 迁移先合入；本规格的迁移不得与其冲突编号或改其已建表。

### 10.2 实施拆分（工单）

| 工单 | 内容 | 依赖 |
| --- | --- | --- |
| 27（本机已实现，待集成测试与真机验收） | 投稿评论 + 上传者免会员例外 | 22、20 |
| 28 | 数据库迁移：`submissions` 形态、字幕表、`papers` 来源与审核、试卷评论表 | 27、22、26 |
| 29 | `packages/core` 契约与校验（手稿、字幕、用户试卷、审核请求） | 22、26 |
| 30 | 课程材料 API：手稿提交、字幕读写、列表/详情/清理扩展 | 28、29 |
| 31 | 课程材料前端：上传形态、手稿阅读、字幕轨、登录即可上传、我的投稿 | 30 |
| 32 | 用户试卷 API：提交、我的试卷、公开分源、答案接口、管理员审核与上下架守卫 | 28、29、26 |
| 33 | 用户试卷前端：提交页、社区题面/答案页、我的试卷、管理审核页 | 32 |
| 34 | 用户试卷评论与权限矩阵收尾（`paper_comments` API/UI） | 27、28、32 |
| 35 | 端到端验收、运维文档与社区开放前核查更新 | 30–34 |

### 10.3 测试点

- **core 纯函数**：手稿字符/UTF-8 字节边界；字幕 SRT/VTT 解析、归一化、时间轴与 cue 数上限；用户试卷题号唯一升序、选项/题型一致性、整卷字节上限、`rightsConfirmed` 必填；`kind` 枚举与禁止字段。
- **迁移与 RLS**：空库重放；既有行回填后 `kind='video'`、`origin='admin'`；各表 RLS 与 `anon`/`authenticated` 撤权；kind 相关 check 拒绝非法组合（手稿带 object key、视频缺 size 等）；级联删除与唯一约束。
- **API 集成（真实临时 Postgres）**：
  - 权限矩阵逐格：访客 / 账号 / 非会员 / 会员 / 过期会员 / 上传者本人 / 管理员 × 上传、评论、评分、看答案、我的内容、管理员接口。
  - 上传只要求登录：非会员创建手稿与视频投稿成功；未登录 401；社区关闭时全部上传 403。
  - 手稿：创建即 `pending`、未上架不可见；审核通过 + 开放后出现在列表；驳回原因本人可见；清理后正文不可读。
  - 字幕：SRT 归一化 VTT；超过 2 条/256 KiB/5000 cue 拒绝；未上架仅本人/管理员可取；已上架公开可取；删除与替换只在审核前。
  - 用户试卷：提交后公开列表/详情/答案不可见；审核通过 + 开放后可见；驳回不上架；答案接口 401/403/404/200 与 `no-store`；上传者本人可看自己未上架试卷答案；题面/列表不含答案字段；`origin` 筛选不把用户试卷混入真题列表。
  - 上下架与审计：用户试卷未审核不能上架；通过后上架写 `listing_changes`；社区关闭不能上架；真题管理员路径不受影响。
  - 评论与评分：非会员评论 403、上传者本人免会员可评、非上传者非会员仍 403；评分要求会员且不能自评；用户试卷不可评分（无该接口）。
  - IDOR：别人的投稿、字幕、试卷、我的列表均 404/403，不能读不能改。
- **Web 组件/页面测试**：登录即可上传的入口逻辑；手稿表单校验与渲染；字幕轨挂载；用户试卷提交表单（含 JSON 导入）、题面页/答案页的未登录/非会员/上传者/管理员状态；管理审核页。
- **端到端（本机）**：真实 API + 临时库，用虚构内容跑完整链路：视频 + 字幕后台上架、手稿提交审核上架、用户试卷提交审核上架、答案访问权限、评论例外、评分与下架后列表变化。仓库与测试中不得出现真实真题内容。
- 交付前：`pnpm fmt && pnpm lint && pnpm typecheck && pnpm test && pnpm build`；Rust `cargo fmt --check`、`cargo clippy --locked --all-targets -- -D warnings`、`cargo test --locked`（CLI 未改也须确认无回归）；契约重复生成无差异。静态检查、构建、本地运行、浏览器实测、真机实测分开报告。

## 11. 验收标准

1. 社区开放时，非会员登录账号可以上传视频与手稿、提交用户试卷；未登录返回 401；社区关闭时新上传/评论/评分被拒绝，公开列表为空。
2. 手稿单请求提交后为 `pending`，访客看不到；审核通过且上架后可阅读；下架后消失；驳回原因本人可见；正文读取复用安全 Markdown 渲染。
3. 一个视频投稿可附带 0–2 条 SRT/VTT 字幕，服务端归一化为 VTT；未上架只有本人/管理员可取，已上架公开可取；超限、格式错误、时间轴非法返回 400。
4. 用户试卷提交后为 `pending`，公开接口（列表、题面、答案）均不可见；管理员可通过、驳回（必填原因）；通过且上架后出现在用户试卷列表；下架后消失。
5. 用户试卷的题面页、列表、摘要、OG、站内搜索、sitemap 不含答案与解析；答案只在 `/api/papers/{slug}/answers` 与答案页出现，响应 `no-store`。
6. 答案接口：未登录 401；非会员且非上传者/管理员 403；会员 200；试卷上传者本人 200；未上架或不存在 404；别人试卷的答案不泄露。
7. 评论：非会员发/回 403；上传者本人在自己的投稿/试卷下免会员可发；访客可读已上架内容评论；管理员可删除并留审计。
8. 评分：只有会员能给已上架课程材料投稿评分；不能给自己的投稿评分；非会员 403；用户试卷没有评分入口。
9. 驳回清理：视频满 30 天删 R2 对象与字幕正文；手稿满 30 天清空正文并保留元数据；用户试卷不上架、正文保留仅本人/管理员可见。
10. 权限与归属：上传/评论/看答案/审核都从会话取身份；别人的投稿、字幕、试卷读不到也写不进；管理员权限每次回库复核。
11. 迁移从空库重放通过，既有视频投稿回填 `kind='video'` 且行为不变，真题发布链路与 `/exams` 行为不变。
12. 文档落盘：规格、ADR 0017、GLOSSARY、PLAN 相关段落与工单 28–35 更新完成；不 commit、不 push、不改云资源。

## 12. 非目标

- 视频转码、HLS、DRM、防下载；音频/播客；字幕自动生成、机器翻译或人工校对。
- 独立字幕投稿，或给站主已发布的讲投稿字幕/讲稿。
- PDF、图片、Office、压缩包等文件投稿；封面图与站内图片托管。
- 用户试卷的编辑、撤回、版本历史、自动从原始 Markdown/PDF 拆题、做题判分、自动批改。
- 用户试卷评分与推荐；用户试卷进入 `/exams` 真题列表或 sitemap 的答案部分。
- 用户之间的私信、关注、多层回复；举报/申诉的完整工作流（见 §13）。
- 用户内容通过 CLI 或 Agent 令牌上传；新增令牌 scope。
- 支付与会员购买渠道（[ADR 0005](../adr/0005-accepted-compliance-risks.md) 约束不变）。

## 13. 开放问题

1. **文本内容的数据库体积**：手稿与字幕存 Postgres，免费库 500 MB；何时迁到 R2 或单独对象/分表？默认先按 1 MiB 与 256 KiB 上限观察用量，超过 400 MB 告警时再评估（对应 PLAN §6 的容量措施）。
2. **驳回内容的保留期限**：用户试卷驳回后正文保留在库内（仅本人/管理员可见）；是否需要像视频一样 30 天后清空正文，或支持管理员彻底删除？
3. **用户试卷的编辑与撤回**：当前提交后不可编辑、不可撤回；是否需要「下架草案」或版本化？
4. **视频与手稿是否合为同一审核单元**：当前是两种投稿形态；是否要支持「一个视频 + 它的手稿 + 字幕」像讲一样作为一个投稿包？
5. **用户试卷评论是否开放**：本规格按站主「投稿/试卷下评论」的表述假定开放，并与投稿评论同一套规则；若站主只希望投稿有评论，则只保留 ticket 27，删除 `paper_comments` 与相应接口。
6. **会员到期后的上传者例外**：本规格按「内容所有者」而非会员期判断评论例外；内容转手/账号注销时归属如何处理需确认。
7. **字幕语言与显示**：语言标签是否限制为固定列表（中文/英文/中英双语），是否允许同一语言两条不同字幕？
8. **用户试卷公开页索引**：题面页是否允许搜索引擎收录？本规格要求答案页 `noindex`；题面页暂按可索引但需标注「用户投稿」，如担心版权风险可整体 `noindex`。
9. **CLI/Agent 提交**：是否需要 `scope=submit` 的账号令牌与 `mykaoyan submit` 命令；若需要，须重开 ADR 0006 的公开契约范围与权限设计。
10. **排序口径**：视频与手稿是否继续混排在同一贝叶斯基准（本规格按混排）；用户试卷不参与评分与推荐。
11. **侵权投诉与彻底删除**：与[法律与反馈说明](../ops/legal-and-feedback.md)的投诉举报/申诉流程如何衔接；需要运营与法务输入，不在本规格内定稿。

## 14. 与现有 ADR 的关系

- **ADR 0013（投稿分片生命周期）**：分片、服务端核对、审核与清理、上传只要求登录均不变；本规格只把内容形态从「仅视频」扩为「视频 + 手稿 + 字幕」，并把同一套审核/清理语义套到文本。视频对象 key 规则不变。
- **ADR 0014（评分聚合）**：贝叶斯公式、`C=10`、推荐门槛与「不能给自己评分」不变；评分范围扩展到已上架的课程材料投稿（视频与手稿），用户试卷不参与评分。全站基准的组成会因手稿投稿加入而变化，公式与口径不变。
- **ADR 0016（真题答案隔离）**：题面公开、答案只在单独答案页、答案不进公开载体的规则原样适用于用户试卷；新增 `origin` 与 `rights_confirmed_at` 区分站主授权真题与用户 UGC，管理员发布路径与答案接口的会员/上传者/管理员放行规则不变。审核通过不等于授权确认。
- **ADR 0015（讲义直写）**：手稿与字幕沿用「纯文本单请求直写、不建对象上传链路」的先例；用户试卷沿用结构化直写。
- **ADR 0003 / 0006 / 0011**：视频仍在 R2、公开契约仍只覆盖进度与管理员发布接口、CLI 权限模型不变；用户上传不进公开契约。
