# 我的考研

面向考研人的免费课程与讲义、学习追踪和会员社区。目标与边界见 [规划](docs/PLAN.md)，术语见 [GLOSSARY.md](GLOSSARY.md)。

## 本地开发

使用 `.node-version` 指定的 Node.js 主版本与 `package.json` 指定的 pnpm 精确版本。测试还需要 Python 3，以及 `initdb`、`pg_ctl`、`createdb`、`psql`、`pg_dump`、`pg_restore`（本机已验证 Postgres 15，CI 使用 17）：

```sh
pnpm install --frozen-lockfile
pnpm fmt
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

包特定依赖由各包自行声明；`tsx`、`@types/node`、`oxfmt`、`oxlint`、`typescript`、`vitest` 这些全仓库工具只在根声明。新增包必须提供 `typecheck`、`test`、`build` 脚本，确保根聚合命令覆盖它。

`pnpm test` 在没有 `DATABASE_URL` 时自动建立并关闭独立临时 Postgres；显式传入的测试连接仅允许本机名为 `mykaoyan_test` 的空库。开发用的 Supabase 连接不能拿来跑测试。

本地开发分两个终端：前端 `pnpm dev`（`http://localhost:3000`）；后端 `pnpm serve`（`http://127.0.0.1:3001`，前端开发时的 `/api/**` 代理指向它）。`pnpm serve` 会自动读取仓库根目录的 `.env`，shell 里已有的同名变量优先；不配置 `DATABASE_URL` 时只启用不依赖数据库的接口（招生目录查询，课程/讲义返回空列表），本地不需要 Postgres；配置数据库后会额外启用课程、讲义、认证等接口，此时还需要 `BETTER_AUTH_SECRET`（至少 32 字符）、`BETTER_AUTH_URL`、`SMS_PROVIDER`（本地开发填 `memory`）。基础配置 `NODE_ENV`、`PORT`、`MEDIA_SIGNING_KEY` 必须齐备，缺哪个键启动时会直接列出来，配置不得提交到仓库。前端生产启动通过 `pnpm --filter @mykaoyan/web start`，会先验证 `NODE_ENV`、`HOST`、`PORT`。

M0 当前交付状态、配置变量、上线前置条件与实测缺口见 [本地交付报告](docs/delivery/m0-local.md)。

本地首页已按站主确认的新版 E「讲义书房」实现，课程与讲义读取现有公开接口；配色与排版以 [DESIGN.md](DESIGN.md) 为准。[首页交付记录](docs/delivery/home.md) 区分了前端验证、API 缺口和全仓库检查的外部阻塞。

本地首页还支持“报考目标 → 考试组合 → 当前学习范围”的三步选择，保存浏览器草稿后进入按科目展示的个人工作台。草稿仅此浏览器可用，尚未同步到账号；背单词等工具仍在筹备。详见 [工作台交付记录](docs/delivery/study-workspace.md)。

## 备案等待期间的前端

前端临时部署为独立 `mykaoyan-web` Worker，绑定 `https://mykaoyan.cn`。已部署版本仍为 Hello 页面，本轮正式首页尚未重新部署；API 仍待 ECS，媒体服务继续使用独立 Worker。

```sh
pnpm --filter @mykaoyan/web build:workers
pnpm --filter @mykaoyan/web deploy:workers --dry-run
# 获得本轮部署授权后，使用 cf 登录或受保护的进程环境提供凭据：
pnpm --filter @mykaoyan/web deploy:workers
```

默认 `pnpm --filter @mykaoyan/web build` 与 `start` 仍用于 ECS 的 Node 服务。配置与取舍见 [ADR 0008](docs/adr/0008-temporary-web-worker.md)。

## 许可与内容

代码采用 [MIT 许可证](LICENSE)。课程视频、字幕、讲稿与讲义保留所有权利，不属于 MIT 授权范围，课程内容不存放在本仓库。词表、题目、答案与笔记属于考生自己的私有内容，不提交到仓库。
