# 投稿上传与审核（ticket 22、30）

现有考试科目页提供“投稿”和“我的投稿”，内容管理页增加“投稿审核”。投稿分两种形态：视频（mp4，存 R2）与手稿（Markdown 正文直存 Postgres）；视频投稿还可以附带最多两条 SRT/VTT 字幕。登录用户可以直接投稿，上传只要求登录、不要求会员；未登录点击投稿入口先登录。续传只要求本人登录，会员到期不影响已有投稿和继续上传。评论、评分与查看真题答案仍要求有效会员。

ticket23已在公开投稿列表接入评分、推荐及科目/考点筛选；公开列表改为按加权分排序，见[评分说明](ratings.md)。本人历史与管理员审核列表仍按创建时间排列。

## 配置与开放

与评论共用API运行时的 `COMMUNITY_ENABLED`，未设置默认false，仅接受true/false。关闭时页面显示“投稿暂未开放”，所有初始化、续传、分片签名、完成登记、手稿提交、字幕读写接口都拒绝；公开列表、手稿正文、字幕与访客播放也关闭。管理员仍可审核和下架，关闭时不能上架；审核通过先保留为未上架，开放后再手动上架。

R2复用既有的 `R2_ACCOUNT_ID`、`R2_ENDPOINT`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`；播放复用 `MEDIA_SIGNING_KEY` 与 `MEDIA_BASE_URL`。Cloudflare管理API令牌不能替代R2 S3凭据。手稿与字幕不产生R2对象，不需要额外配置。

真实直传还需要桶的CORS允许站点origin的PUT及所用请求头。不要覆盖原有课程发布规则；先读现有配置，再合并需要的规则。上传片不经过ECS，API只发送签名、列表与对象元数据请求。分片最小值、未完成上传生命周期和CORS要求分别见 [R2上传说明](https://developers.cloudflare.com/r2/objects/upload-objects/)、[CORS说明](https://developers.cloudflare.com/r2/buckets/cors/)。本轮未读取或更改真实桶配置。

## 使用

1. 在考试科目页点击投稿，选择形态。视频：填写标题、简介、三位考试科目代码及可选考点，选择mp4原视频；文件须H.264、大小不超过500MB、时长不超过30分钟；不支持转码。手稿：填写同样的元数据，在Markdown编辑区写正文；正文1至1,000,000字符且UTF-8不超过1MiB。
2. 视频页面先核对容器信息和整个文件指纹，再逐片直传。进度到100%且出现“待审核”才表示登记成功。手稿单请求提交，成功即进入待审核。
3. 视频可选附带最多两条字幕：选择SRT或VTT文件、填写语言标签（如 `zh`、`zh-Hans`、`en`）与显示名。浏览器只做结构与大小预检；服务端严格解析时间轴（开始早于结束、cue不超过5000条、单条不超过256KiB、总时长不超过视频时长），统一归一化为VTT存库。字幕只属于视频投稿，手稿没有字幕。
4. 中断、暂停或刷新后，在“我的投稿”选择“继续此投稿”，重新选择同一个原视频；保留已完成分片，只补传缺失片。信息或文件不匹配会拒绝；若未完成上传已被R2生命周期终止，请新建投稿。字幕在审核前可以在“我的投稿”里管理（整体替换，最多两条），已审核后不能再改。
5. 管理员预览后通过或填写原因驳回；手稿在审核列表可直接“阅读手稿”预览正文。通过后对访客上架，可单独下架；页面回读最近一次上下架管理员与时间，完整操作记录保存在listing_changes。驳回不会上架。
6. 驳回内容满30天后自动清理。生产API启动时及每小时处理一批50条。视频先标记、再删R2对象，删除成功后连同字幕行一起记清理完成；手稿在同一事务里清空正文并记录清理时间，保留元数据与审核记录。失败轮转重试，管理员可点“重试到期文件清理”，之后刷新管理列表核对。清理后停止签发播放令牌，正文与字幕都不可读。

浏览器只做上传前编码、时长与字幕结构检查，服务器HEAD核对大小与类型；审核员须实际预览确认内容。不要上传真题原文、答案或私人资料。短时凭证已签发后不能即时撤销，关闭/下架只停止新的签发。

## 接口

全部API使用网页会话，Agent令牌不能投稿。管理员权限在数据库重新确认。未登录401，无权限403；不存在或别人的上传404；状态冲突409。所有分页从0开始，每页50条，返回hasMore。

| 接口 | 行为 |
| --- | --- |
| GET /api/submissions?subject=302&topic=&kind=&page=0 | 访客读取已通过且上架的投稿；新增可选 `kind=video|manuscript` 筛选；返回enabled与kind |
| GET /api/submissions/mine?page=0 | 本人记录，任何时候都可读；含形态、指纹、审核结果、字幕摘要、手稿字节数与清理状态 |
| POST /api/submissions/manuscripts | 手稿单请求提交：`id`（客户端UUID，幂等重试）、`kind=manuscript`、title、summary、subjectCode、topicId、manuscriptMarkdown；写入即pending，服务端计算SHA-256指纹与UTF-8字节数；相同id与内容返回同一条，内容不一致409 |
| POST /api/submissions/uploads | 视频投稿：初始化或按原id恢复；需id、title、summary、subjectCode、topicId（可null）、size、duration、codec=h264、contentType=video/mp4、fingerprint |
| GET /api/submissions/:id/upload | 本人视频上传的服务器进度，返回partSize、已存分片和对象是否已完成 |
| POST /api/submissions/:id/parts/:number | 为当前片签发15分钟直传URL；长度由服务端计算 |
| POST /api/submissions/:id/complete | 读取R2分片和HEAD核验后登记；可用原id重试 |
| PUT /api/submissions/:id/subtitles | 本人、视频、审核前整体替换字幕：`{tracks:[{language,label,format,content}]}`，0至2条、语言不重复；服务端解析SRT/VTT并归一化为VTT；已审核409 |
| DELETE /api/submissions/:id/subtitles/:language | 本人、视频、审核前删除一条字幕 |
| GET /api/submissions/:id/subtitles/:language | 已上架且社区开放时公开；未上架仅本人/管理员；返回`text/vtt; charset=utf-8`、nosniff、no-store |
| GET /api/submissions/:id/manuscript | 已上架且社区开放时公开；未上架仅本人/管理员；返回`{markdown}`与no-store；已清理404 |
| POST /api/submissions/:id/playback-token | 与讲同格式的HMAC短时令牌；待审核/下架文件仅本人或管理员预览；视频令牌附带字幕元数据（语言、显示名、同源VTT地址）；手稿返回409“手稿没有播放令牌” |
| GET /api/admin/submissions?page=0 | 所有投稿及最近上下架审计，含形态、字幕数与手稿字节数；手稿正文经上一条接口预览 |
| POST /api/admin/submissions/:id/review | `{decision:"approve"}` 或 `{decision:"reject",reason}`；只处理待审核，重复审核409 |
| PUT /api/admin/submissions/:id/listing | `{listed}`；仅已通过且未清理内容可上架 |
| POST /api/admin/submissions/cleanup | 清理/重试已驳回满30天的内容：视频删对象与字幕，手稿清空正文；返回removed/pending计数 |

`submissions` 与 `submission_subtitles` 开启RLS，对PUBLIC、anon、authenticated撤权。迁移只在本机专用临时库重放；未迁移远程数据库、未部署或开启真实社区。流程决策见 [ADR0013](../adr/0013-submission-multipart-lifecycle.md)、[ADR0017](../adr/0017-user-content-uploads.md)与[规划0005](../specs/0005-user-uploads.md)。
