# 04: 媒体链路实测

**What to build:** 一个测试视频放在 R2 私有桶里，浏览器带有效播放令牌时能从 `media.mykaoyan.cn` 播放并拖动进度条，令牌无效时被拒绝且不读 R2；并拿到国内播放实测数据。

**Blocked by:** 01（仓库卫生与 monorepo 骨架）

**Status:** ready-for-human（仅本地部分；外部验收待环境）

- [x] 媒体 Worker 校验 HMAC 播放令牌；无效或过期返回 401，且测试断言拒绝路径没有读 R2
- [x] Range：正常区间 206；不可满足区间 416 与 `bytes */size`；判断用值而非键存在性
- [x] 条件请求：`If-None-Match`、`If-Modified-Since` 不满足返回 304；412 只给 `If-Match`、`If-Unmodified-Since`
- [x] 响应带 `Cache-Control: private, no-store`；wrangler 配置显式关闭缓存并注释原因
- [x] CORS 只放精确 origin，测试从 wrangler 配置读取期望值
- [ ] R2 替身按真实返回形状建模，并用真实桶校准一次
- [ ] 交付报告记录国内至少三地的首字节、持续播放 5 分钟是否卡顿、拖动响应时间

## 本轮交付说明

本地实现与分层验证见 [M0 本地交付报告](../../../docs/delivery/m0-local.md)。未勾选项包含真实云资源、CI 或网络验收；本机替身与临时数据库测试不能替代这些证据。本轮仅作本地提交，未 push 或部署。
