---
status: accepted
---

# 视频存 R2，由媒体 Worker 校验 HMAC 播放令牌后直接回给浏览器

课程视频和投稿视频体积大，经过 ECS 转发会让出口带宽费用失控。因此视频放在 R2 私有桶，浏览器直接请求 `media.mykaoyan.cn`；NestJS 按「账号 × 讲」或「账号 × 投稿」签发短时 HMAC 令牌，媒体 Worker 只校验令牌，不查数据库。投稿上传用 R2 预签名 URL 分片直传，文件不经过 ECS。只播放 mp4（H.264），支持 Range，不转码，不用 Cloudflare Stream。

## Considered Options

- **Cloudflare Stream**：不保证有中国大陆节点，按分钟计费。
- **阿里云 OSS 加 CDN**：国内最快，CDN 也要求备案；站主选择 R2。
- **Cloudflare Access 保护媒体域**：只适合「只有自己能看」，普通用户无法通过。

## Consequences

- 签名 URL 只能防盗链，防不住有权限的人下载后传播。v1 接受这个现实，不做 DRM。
- 大陆访问 R2 走境外节点，M0 必须实测持续播放、拖动进度和首字节时间。
- 签名密钥只存在 NestJS 和媒体 Worker 两处，轮换时两边同时换并用新令牌实测。
