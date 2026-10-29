# 10: 进度文件云端读写（网页）

**What to build:** 登录的考生可以在网页上下载自己的进度文件，或上传一份替换云端学习数据；上传前看到变更摘要；如果云端在下载之后被改过，上传会被拒绝；可以查看历史版本列表。

**Blocked by:** 05（手机号验证码登录）、09（公开契约 v1）

> M2 交接：先读 [HANDOFF-M2.md](../HANDOFF-M2.md)（现状、顺序、决策点、外部阻塞）。

**Status:** ready-for-human（本地完成；线上验收待部署）

- [x] 每个账号一份进度文档，历史版本只追加
- [x] `GET` 返回文档与 `ETag`；`PUT` 带 `If-Match`，不匹配 412、缺失 428，成功返回各类记录的新增、修改、删除条数
- [x] 两个并发 `PUT` 只有一个成功（测试）
- [x] 历史版本列表接口与页面
- [x] 「别人的数据读不到、写不进」的接口测试
- [x] 写入后校验受影响行数或读回结果

## 现状（2026-10-29）

前端新增 `/progress` 页面（`apps/web/src/routes/progress.tsx` + `apps/web/src/features/progress/progress-page.tsx`）：

- 展示当前版本、ETag、最后更新时间和各类记录条数；
- 下载整份进度文件；
- 选择 JSON 文件后先用 `progressFileSchema` 校验，再展示按类别的新增/修改/删除摘要，确认后带 `If-Match` 上传；
- 412 冲突提示重新加载，428 显示服务端说明；
- 历史版本列表（`GET /api/v1/progress/revisions`）。

后端接口与鉴权沿用 `apps/api/src/progress`；本轮补了「两个并发 PUT 只有一个成功」的接口测试。前端单测覆盖解析、摘要、API 错误分支与页面各状态（`pnpm --filter @mykaoyan/web test`）。浏览器登录后的端到端验收需要 API 上线后再做。
