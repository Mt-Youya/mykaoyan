# 30: 课程材料 API（手稿提交、字幕读写、列表与清理扩展）

**What to build:** `apps/api/src/submissions` 支持 `kind='manuscript'` 的单请求提交，以及视频投稿的 0–2 条字幕读写与公开读取；公开列表、我的投稿、播放令牌、管理员审核列表与清理按 `kind` 与字幕扩展；权限按「上传只要求登录」。

**Blocked by:** 28（迁移）、29（契约）

**Status:** ready-for-agent

**Spec:** [规划 0005](../../../docs/specs/0005-user-uploads.md)｜**ADR:** [0017](../../../docs/adr/0017-user-content-uploads.md)

- [ ] `POST /api/submissions/manuscripts`：会话取上传者；社区开关；按客户端 `id` 幂等（相同内容返回同一条、内容不一致 409）；服务端计算 SHA-256 指纹与 UTF-8 字节数；写入即 `pending`；返回本人视图
- [ ] `PUT /api/submissions/:id/subtitles`、`DELETE /api/submissions/:id/subtitles/:language`：仅本人、仅 `uploading` / `pending` 且未审核；整体替换 0–2 条；服务端解析 SRT/VTT（时间轴、cue ≤ 5000、单条 ≤ 262,144 字节、总时长不超过视频）并归一化 VTT；越权 404/403，已审核 409
- [ ] `GET /api/submissions/:id/subtitles/:language`：已上架公开；未上架仅本人/管理员；返回 `text/vtt; charset=utf-8`、`nosniff`、`no-store`；不存在/不可见 404
- [ ] `GET /api/submissions/:id/manuscript`：已上架且社区开放时公开；未上架仅本人/管理员；返回 `{markdown}` 与 `no-store`；已清理/不可见 404
- [ ] `GET /api/submissions`：返回 `kind`，可选 `kind=video|manuscript` 筛选；排序与评分口径不变
- [ ] `GET /api/submissions/mine`：返回 `kind`、`hasSubtitles`、`subtitleLanguages`、`manuscriptBytes`、清理状态；手稿续传/上传进度接口不适用
- [ ] `POST /api/submissions/:id/playback-token`：`kind='manuscript'` 返回 409「手稿没有播放令牌」
- [ ] 管理员列表返回 `kind`、`subtitleCount`、`hasManuscript`；手稿预览正文（仅管理员，`no-store`）；审核、上下架规则不变
- [ ] 清理：视频满 30 天删 R2 对象后删除字幕行；手稿满 30 天清空正文并写 `deleted_at`；清理后正文/字幕/播放均不可用；保留审核记录
- [ ] 权限测试：非会员登录可创建手稿/视频投稿；未登录 401；社区关闭全部上传 403；别人的投稿/字幕 404；管理员角色回库复核
- [ ] 手稿与既有视频逻辑拆分文件，单文件 ≤ 500 行

**验收标准：** 手稿提交→待审核→通过→上架链路可用；字幕 SRT 归一化 VTT、数量/大小/时间轴上限被拒绝；未上架字幕只有本人/管理员可取；IDOR 与社区关闭测试通过；既有视频投稿行为不变。

**红线：** 服务器不转码、不下载视频流验证编码；对象 key 与上传编号不接受客户端输入；清理顺序先写库再删对象；不写真实内容到仓库。

**验收命令：**

```bash
pnpm --filter @mykaoyan/api test
pnpm typecheck && pnpm build
```
