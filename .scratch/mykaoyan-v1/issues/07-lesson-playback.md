# 07: 讲的视频播放

**What to build:** 访客打开一讲就能播放视频、打开字幕、拖动进度；看很久也不会因为令牌到期被打断；切换到另一讲时播放的是正确的视频。

**Blocked by:** 04（媒体链路实测）、06（课程、章、讲、讲义的浏览）

**Status:** ready-for-human（本地完成；真实媒体与真机待环境）

- [x] 后端按「访客或账号 × 讲」签发短时播放令牌；签名密钥只存在后端与媒体 Worker 两处
- [x] 播放器 `crossOrigin` 模式加载跨域字幕
- [x] 令牌按视频 ID 索引；续签前记录播放位置，续签后从原位置继续；续签失败会重新调度
- [x] 同一路由换到另一讲时，播放器加载新视频而不是沿用旧视频
- [x] 非法 TTL 拒绝签发
- [x] `play()` 失败时按真实错误类型提示

## 本轮交付说明

签发：`apps/api/src/playback/`，`POST /api/lessons/:slug/playback-token`，claims 与媒体 Worker 的验签一一对应；字幕有独立令牌（Worker 要求令牌 key 与路径一致）。已登录时 subject 用账号 id，访客才用 `mk_visitor` cookie（两者都有测试）。测试 8 个，含用 WebCrypto 按 Worker 算法独立验签、访客 cookie 复用、非法 TTL（0/3601/小数/字符串/多余字段）400、未上架 404。
播放器：`apps/web/src/features/playback/player.tsx`，`crossOrigin="anonymous"` + `<track>`；到期前 60 秒续签，续签前记录 `currentTime` 与播放状态，续签后回到原位；失败按 1/2/4 秒退避重试，最终失败给明确提示；`useEffect` 依赖 slug，换讲时清空令牌与视频源。
未做：真实 R2 视频、字幕文件与真机拖动/长时间播放实测；`play()` 的错误分支只在代码层实现，示例 `videoKey` 不是真实媒体文件，未能在浏览器里触发这两类错误。
