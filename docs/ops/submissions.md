# 投稿上传与审核（ticket 22）

现有考试科目页提供“投稿视频”和“我的投稿”，内容管理页增加“投稿审核”。访客、非会员点击投稿入口可看到手动开通与兑换码说明，并进入实际的会员期面板。续传入口使用相同会员判断；当前会员期失效时已有投稿记录保留。

ticket23已在公开投稿列表接入评分、推荐及科目/考点筛选；公开列表改为按加权分排序，见[评分说明](ratings.md)。本人历史与管理员审核列表仍按创建时间排列。

## 配置与开放

与评论共用API运行时的 `COMMUNITY_ENABLED`，未设置默认false，仅接受true/false。关闭时页面显示“投稿暂未开放”，所有初始化、续传、分片签名、完成登记接口都拒绝；公开列表与访客播放也关闭。管理员仍可审核和下架，关闭时不能上架；审核通过先保留为未上架，开放后再手动上架。

R2复用既有的 `R2_ACCOUNT_ID`、`R2_ENDPOINT`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`；播放复用 `MEDIA_SIGNING_KEY` 与 `MEDIA_BASE_URL`。Cloudflare管理API令牌不能替代R2 S3凭据。

真实直传还需要桶的CORS允许站点origin的PUT及所用请求头。不要覆盖原有课程发布规则；先读现有配置，再合并需要的规则。上传片不经过ECS，API只发送签名、列表与对象元数据请求。分片最小值、未完成上传生命周期和CORS要求分别见 [R2上传说明](https://developers.cloudflare.com/r2/objects/upload-objects/)、[CORS说明](https://developers.cloudflare.com/r2/buckets/cors/)。本轮未读取或更改真实桶配置。

## 使用

1. 在考试科目页点击投稿，填写标题、简介、三位考试科目代码及可选考点，选择mp4原视频。文件须H.264、大小不超过500MB、时长不超过30分钟；不支持转码。
2. 页面先核对容器信息和整个文件指纹，再逐片直传。进度到100%且出现“待审核”才表示登记成功。
3. 中断、暂停或刷新后，在“我的投稿”选择“继续此投稿”，重新选择同一个原文件；保留已完成分片，只补传缺失片。信息或文件不匹配会拒绝；若未完成上传已被R2生命周期终止，请新建投稿。
4. 管理员预览后通过或填写原因驳回。通过后对访客上架，可单独下架；页面回读最近一次上下架管理员与时间，完整操作记录保存在listing_changes。驳回不会上架。
5. 驳回文件满30天后自动清理。生产API启动时及每小时处理一批50条；先标记、再删对象，失败轮转重试。管理员可点“重试到期文件清理”，之后刷新管理列表核对。清理后保留审核信息，停止签发播放令牌。

浏览器只做上传前编码、时长检查，服务器HEAD核对大小与类型；审核员须实际预览确认内容。不要上传真题原文、答案或私人资料。短时凭证已签发后不能即时撤销，关闭/下架只停止新的签发。

## 接口

全部API使用网页会话，Agent令牌不能投稿。管理员权限在数据库重新确认。未登录401，无权限403；不存在或别人的上传404。所有分页从0开始，每页50条，返回hasMore。

| 接口 | 行为 |
| --- | --- |
| GET /api/submissions?subject=302&page=0 | 访客读取已通过且上架的投稿；返回enabled |
| GET /api/submissions/mine?page=0 | 本人记录，会员到期仍可读；含指纹、审核结果与清理状态 |
| POST /api/submissions/uploads | 初始化或按原id恢复；需id、title、summary、subjectCode、topicId（可null）、size、duration、codec=h264、contentType=video/mp4、fingerprint |
| GET /api/submissions/:id/upload | 本人上传的服务器进度，返回partSize、已存分片和对象是否已完成 |
| POST /api/submissions/:id/parts/:number | 为当前片签发15分钟直传URL；长度由服务端计算 |
| POST /api/submissions/:id/complete | 读取R2分片和HEAD核验后登记；可用原id重试 |
| POST /api/submissions/:id/playback-token | 与讲同格式的HMAC短时令牌；待审核/下架文件仅本人或管理员预览 |
| GET /api/admin/submissions?page=0 | 所有投稿及最近上下架审计，包含未完成上传 |
| POST /api/admin/submissions/:id/review | `{decision:"approve"}` 或 `{decision:"reject",reason}`；只处理待审核，重复审核409 |
| PUT /api/admin/submissions/:id/listing | `{listed}`；仅已通过且未清理文件可上架 |
| POST /api/admin/submissions/cleanup | 清理/重试已驳回满30天的文件，返回removed/pending计数 |

`submissions` 开启RLS，对PUBLIC、anon、authenticated撤权。两份迁移只在本机专用临时库重放；未迁移远程数据库、未部署或开启真实社区。流程决策见 [ADR0013](../adr/0013-submission-multipart-lifecycle.md)。
