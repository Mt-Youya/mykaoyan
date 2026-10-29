# CLI 发布的本机 R2 S3 配置

Cloudflare API Token 与 R2 S3 的 Access Key ID / Secret Access Key 不是同一个东西。前者不能直接填入 S3 凭据字段。当前发布代码不会自动创建桶或凭据。

在 Cloudflare 控制台进入 R2 的 API 令牌管理，创建仅限目标私有桶的 Object Read & Write 凭据。保存一次性显示的 Access Key ID 和 Secret Access Key，不粘贴进聊天、工单或仓库。

在项目根目录被 Git 忽略的 `.env` 中**追加**以下五项，不覆盖原有配置：

```dotenv
R2_ACCOUNT_ID=<Cloudflare账号ID>
R2_ACCESS_KEY_ID=<R2的AccessKeyID>
R2_SECRET_ACCESS_KEY=<R2的SecretAccessKey>
R2_BUCKET=<已有私有桶名称>
R2_ENDPOINT=https://<Cloudflare账号ID>.r2.cloudflarestorage.com
```

它们是 NestJS 的运行时配置，不能加 VITE_ 前缀，也不能写进前端 Worker。五项整组提供；没有配置时其他接口仍可运行，发布准备接口返回 503。部分缺失、空串或端点账号不符则启动失败。根 `.env` 建议仅本人读写。`pnpm serve` 会加载根 `.env`，修改后重启 API。ECS 需要按同样变量名配置私有运行环境，但部署需另行授权。

管理员在网页会话中调用 `POST /api/agent-tokens`，请求 `{ "name": "课程发布", "scope": "publish" }` 创建专用发布令牌。默认 scope=progress 的令牌不能发布，即便账号是管理员；发布令牌也不能读写进度。登录保存或通过 MYKAOYAN_TOKEN 安全注入 CLI，不写令牌参数。

```sh
mykaoyan login
mykaoyan publish "$SRC/课程/数学二/01-导数" --dry-run
mykaoyan publish "$SRC/课程/数学二/01-导数"
```

dry-run 本地配对、计算摘要，不访问 API，也不上传。只有完整同名 mp4/srt/md 组合会发布，其他文件报告为 skipped；答案、解答、真题、answer、solution、M-P 等文件或目录排除，不读取其内容。没有完整组合时失败，不发布空章。不要把生成的课程内容或源文件复制进仓库。

成功输出含各讲版本、对象 key、是否无变化和跳过的文件，不输出签名 URL。新内容默认下架；重新发布不改变任何上架状态。若某讲失败，前面已完成的讲保留，修正后重跑即可。

若 `cleanupPending=true`，新内容已登记而旧对象清理未完成。重新发布相同内容也会重试旧对象清理；保留输出中的 publicationId，用发布令牌重试 `POST /api/v1/publish/<publicationId>/complete`，接口不会再次递增内容版本。不要直接删除其他讲可能引用的历史对象。

## 验收边界

2026-10-29 已在隔离本地 Postgres + 真实 NestJS API + 真实 R2 上完成验收：小文件 PUT/HEAD、替换后的旧对象删除、重复 PUT 返回412，以及源目录数学二“01-导数”的12讲、24个对象逐一核对。整章重复发布不新增上传计划或版本，下架状态保留。另4个不完整配对文件报告跳过。

本次验收产生的28个对象（含替换测试）已按计划清单清理，并逐个 HEAD 确认不存在；临时数据库与账号/令牌也已清理。完整过程见工单14。线上部署与浏览器/真机、媒体播放仍需分别验收。CLI 使用预签名 PUT，本工单没有改变 R2 CORS 或公开访问设置。
