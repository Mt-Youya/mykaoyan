# 10: 进度文件云端读写（网页）

**What to build:** 登录的考生可以在网页上下载自己的进度文件，或上传一份替换云端学习数据；上传前看到变更摘要；如果云端在下载之后被改过，上传会被拒绝；可以查看历史版本列表。

**Blocked by:** 05（手机号验证码登录）、09（公开契约 v1）

**Status:** ready-for-agent

- [ ] 每个账号一份进度文档，历史版本只追加
- [ ] `GET` 返回文档与 `ETag`；`PUT` 带 `If-Match`，不匹配 412、缺失 428，成功返回各类记录的新增、修改、删除条数
- [ ] 两个并发 `PUT` 只有一个成功（测试）
- [ ] 历史版本列表接口与页面
- [ ] 「别人的数据读不到、写不进」的接口测试
- [ ] 写入后校验受影响行数或读回结果

## 现状（2026-10-28）

后端 `apps/api/src/progress` 已实现 `GET/PUT /api/v1/progress` 与 `GET /api/v1/progress/revisions`；前端 `apps/web/src/features/progress` 提供 `use-progress` 供今日页与错题页读写。历史版本页面尚未实现。复选框未逐条核销。
