# 目录结构与依赖规则

> M0 起由架构测试强制执行（思路沿用旧 kaoyan `tests/architecture/rules.test.ts`），不通过不能合入。

## 请求路径

当前路径按 [ADR 0010](./adr/0010-worker-api-proxy.md)（方案 B）：前端由 Cloudflare Worker `mykaoyan-web` 承载（`apps/web` 的 SSR 与静态资源），Worker 把 `/api` 与 `/api/**` 反代到广州 ECS 上的 NestJS；浏览器只访问 `mykaoyan.cn`，不需要 CORS。该 Worker 不绑定数据库或媒体签名密钥，密钥只在 ECS 与媒体 Worker。

```
浏览器 ──HTTPS──▶ mykaoyan.cn (Cloudflare Worker: mykaoyan-web)
                    ├── /api/** 反代──▶ api.mykaoyan.cn (广州 ECS: Caddy → apps/api) ──Supavisor──▶ Supabase Postgres（新加坡）
                    └──其余──────▶ apps/web (TanStack Start, SSR，Worker 内)
浏览器 ──HTTPS──▶ media.mykaoyan.cn (apps/media-worker) ──▶ R2 私有桶
浏览器 ──预签名 URL──▶ R2（投稿分片直传）
agent / CLI ──Agent 令牌──▶ mykaoyan.cn/api/v1/*
```

## 目录

```
apps/
  web/            TanStack Start：路由、页面、页面专属组件；不含业务规则
  api/            NestJS：模块、控制器、服务层、Better Auth、权限判断
  media-worker/   Cloudflare Worker：HMAC 播放令牌校验、R2 Range 读取
  cli/            Rust CLI（独立 Cargo 工程，不进 pnpm workspace 依赖图）
packages/
  core/           zod 定义与纯函数领域模型；生成公开契约的脚本
  db/             Drizzle 表结构、SQL 迁移、迁移重放测试
  ui/             shadcn(base-ui) 组件，直接导出源码，不构建 dist
skills/
  mykaoyan/       按 agentskills.io 规范的 skill
deploy/           docker-compose、Caddyfile、冒烟检查脚本
docs/             规划、ADR、坑点、规格
```

公开契约产物（JSON Schema、`openapi.json`）由 `packages/core` 生成到 `apps/web` 的静态目录并提交进仓库；CI 重新生成后必须没有差异。

`apps/web/src/routeTree.gen.ts` 由 TanStack Router 生成并提交，保证干净安装后可直接类型检查；不手工编辑，不参与格式化、lint 与源码架构扫描。

媒体 Worker 的 `worker-configuration.d.ts` 由该包的 `typecheck` 先运行 `wrangler types` 生成，忽略且不提交；运行时类型由锁定的 Wrangler 版本提供。

临时前端的 `cloudflare.config.ts` 使用项目内 `cf` 与 Cloudflare Vite plugin；`.cloudflare/` 中的构建产物、生成类型与状态全部忽略，不参与源码架构扫描。默认 Node 构建保留为回退方案；生产前端由 Worker 承载（[ADR 0010](./adr/0010-worker-api-proxy.md)）。

## 领域

| 领域 | 内容 | 所在包 |
| --- | --- | --- |
| `subjects` | 考试科目代码与统考科目名称 | core |
| `dates` | 上海日期 `LocalDate` 与日期运算 | core |
| `catalog` | 课程、章、讲、讲义、上架状态 | core / api |
| `accounts` | 账号、登录方式、手机号绑定、Agent 令牌 | api（Better Auth）/ db |
| `membership` | 会员期、兑换码、会员判断 | core / db / api / web |
| `comments` | 评论与回复、关键词过滤、删除记录 | core / api |
| `submissions` | 投稿、审核、上传登记 | core / api |
| `ratings` | 评分、贝叶斯平均、推荐 | core / api |
| `progress-file` | 进度文件格式、校验、版本与历史 | core / api |
| `profile`、`plan`、`mistakes`、`daily`、`today`、`topics`、`weekly` | 学习追踪 | core / api / web |
| `vocab`、`backup` | 浏览器本地的词表、单词复习、备份 | core / web |
| `media` | 播放令牌签发与校验 | api / media-worker |
| `publishing` | 管理员内容发布计划、R2 上传校验与幂等登记 | api / db |
| `admissions` | 招生目录查询：研招网硕士专业目录的服务端适配、限速与缓存；页面只拿整理后的字段 | api / web |

新领域先登记在这张表，再建目录。

## 依赖规则

1. 任何代码文件不超过 **500 行**；生成产物不受限，但生成它的源码要分文件。
2. `packages/core` 的 `src/` 不依赖 React、NestJS、Drizzle、zustand、浏览器 API、`fetch`、Node 内置模块；只依赖 zod。`packages/core/scripts/` 是仓库构建工具（生成公开契约），可以用 Node IO，但不得被 `src/` 导入，也不进入构建产物；架构守卫只约束 `src/`。
3. `packages/db` 只依赖 Drizzle 与 core；只被 `apps/api` 导入。
4. `apps/web` 不导入 `packages/db`，不持有数据库连接，不持有服务端密钥；所有数据都通过 `apps/api`。
5. `apps/api` 的控制器只做参数解析和调用服务层；权限判断在服务层，并且每个读写服务都有「别人的数据读不到、写不进」的测试。
6. `apps/media-worker` 不查数据库，只校验令牌。
7. `packages/ui` 下 `components/ui/*` 是 shadcn 生成物，不手工重写；定制放在包装组件里。
8. 跨领域只导入对方的入口文件（`index.ts`），不深层导入，不循环依赖。这里说的「领域」是 `src/` 下的子目录；`src/` 根级文件（`config`、`environment`、`database` 等）是应用骨架，任何领域都可以直接导入。
9. 每个包自己声明用到的依赖，不靠根目录提升；根 `package.json` 只放全仓库工具（oxlint、oxfmt、TypeScript、vitest、tsx、`@types/node`，后两项于 M0 经站主确认保留）。各包用到 tsx 或 Node 类型时仍须分别声明。

## 写法约定

- 日期一律用 core 的 `LocalDate`（Asia/Shanghai），禁止 `new Date().toISOString().slice(0, 10)`。
- 环境变量按「未设置 / 空串 / 有值」三态校验，启动时用 zod 解析一次，缺失或空串直接启动失败；每个变量只认一个名字，不接受别名。允许缺省的变量必须单独写明语义，例如未设置 `DATABASE_URL` 时只装配不依赖数据库的接口（本地招生目录查询），生产环境仍然必填。
- 浏览器可见的变量只用 `VITE_*` 前缀，且只放公开值；服务端密钥只在运行时从进程环境读取。
- 写数据库后校验受影响行数或读回结果，「没报错」不算成功。
- 错误响应用 `application/problem+json`；未登录 401，已登录但无权限 403，不混用。
- 测试与被测代码放在同一目录；`tests/` 只放架构测试、端到端测试和虚构 fixture。
- 网页样式只用 Tailwind 工具类与 `@mykaoyan/ui/base/*` 组件。全站唯一 CSS 入口是 `apps/web/src/styles/globals.css`，设计令牌在 `packages/ui/src/styles/globals.css`（值来自 `DESIGN.md`）；不新增页面级 `.css`，不写内联 `style`，不再维护 BEM 类名。见 [ADR 0009](adr/0009-tailwind-shadcn-web-styling.md)。
