# 26: 真题试卷发布（结构化题面 + 会员/上传者答案）

**What to build:** 管理员用 CLI 发布结构化试卷（科目/年份/来源/逐题题面/选项/答案/解析/考点）；访客浏览已上架题面，答案只对有效会员或试卷上传者本人在单独答案页可见。

**Blocked by:** 14（发布令牌与契约模式）、08（管理员上下架）、13（Rust CLI）

**Status:** done（2026-10-31 本机实现与验收通过；生产迁移与首次真题发布待站主批准）

- [x] 迁移：`papers`、`paper_questions`、RLS、公开角色无表权限、级联删除
- [x] drizzle schema 与包导出
- [x] core：`publishPaperSchema` / `paperQuestionSchema` / `publishPaperResultSchema` 与单测
- [x] `generate-contract`：OpenAPI 路径与组件、`apps/web/public/schemas/publish/v1/paper.schema.json`；CLI 契约同步、重复生成无差异
- [x] 发布 API：`PUT /api/v1/publish/papers/{slug}`，事务 upsert、题号唯一/升序、幂等、默认下架、更新版本 +1
- [x] 公开 API：列表、题面详情（无答案）；答案接口会员/上传者/管理员校验（401/403/404）与 `no-store`；`papers.owner_account_id` 记录上传者
- [x] 管理员上下架支持 `paper` 并写 `listing_changes` 审计
- [x] CLI：`publish-paper paper.json`、`--dry-run`、`--json`、mock 测试
- [x] 页面：`/exams`、`/exams/{slug}`、`/exams/{slug}/answers`（未登录/非会员提示、`noindex`）、导航入口
- [x] 测试：契约、迁移、API、CLI、公开页不含答案、非会员 403、会员/上传者 200
- [x] 文档：spec 0004、ADR 0016、PLAN 红线、GLOSSARY、CLI README、pitfalls mk/API-02
- [x] 本机端到端：发布虚构试卷、公开详情不含答案、会员/上传者可读答案
- [x] 生产迁移（`papers`/`paper_questions`/`owner_account_id` + 投稿评论）已手工应用
- [x] 生产真题：数学二 2007–2026 + 408 2022–2026 共 25 套、690 题已发布并全部上架，写 25 条审计
- [x] 部署：`手动部署` run `41178001262` 成功（runner 构建 + SSH `docker save/load`，不再依赖 ACR/`DEPLOY_KNOWN_HOSTS`）；ECS 三容器运行、API 健康检查 200、生产只读接口验收通过
- [ ] 浏览器/真机验收：域名暂无 A 记录（ICP 未就绪），无法从公网访问
- [ ] 站主填入真实阿里云短信凭据前，生产手机登录不可用（当前为占位值）

**验收证据（2026-10-31）：**

- core：159 tests 通过；API 全量 162 项中 160 通过（2 项 `backup.test.mjs` 因本机缺少 `pg_dump` 失败，CI 安装客户端）；web 25 文件 88 项通过；cli `cargo test` 全部通过（含 5 项 `paper_http`）。
- `pnpm typecheck`、`pnpm build`、`cargo fmt --check`、`cargo clippy --locked --all-targets -D warnings` 通过；契约生成可重复，网站与 CLI OpenAPI 哈希一致。
- 端到端：真实 CLI → 本机 API → 临时 Postgres，发布 `e2e-paper-fictional`（2 题）：首次 `version=1,listed=false,unchanged=false`，二次 `unchanged=true`；CLI dry-run 哈希与服务器返回一致；公开列表/详情可见题面且不含 `answerMarkdown`/`analysisMarkdown`；答案接口未登录 401；集成测试验证非会员 403、会员 200、上传者本人 200 且 `Cache-Control: no-store`。
- 未做：浏览器/真机实测（域名未备案不可达）。
- 生产（2026-10-31）：生产库迁移已应用；CLI 指向生产库的本地 API 发布 25 套（数学二 20 + 408 5），690 题全部有答案、全部 `listed=true`、25 条 `listing_changes` 审计；公开列表 20+5、题面不含答案字段、未登录答案 401 均读回通过。
- 生产部署（2026-10-31）：`手动部署` run `41178001262` 成功；ECS 上 `deploy-api-1`/`deploy-web-1`/`deploy-caddy-1` 均 Up，API 健康 `{"status":"ok","database":"connected"}`；`/api/papers?subject=302` 20 套、`subject=408` 5 套、详情无答案字段、未登录答案 401、试卷评论公开可读；`/exams`、`/community/papers`、`/community/papers/new` 页面 200。

**红线：** 未授权真题内容不上站；官方公告原件不上站；答案不进公开页面/索引/搜索/OG/sitemap；真题内容不进仓库。

**验收命令：**

```bash
pnpm typecheck && pnpm build
pnpm --filter @mykaoyan/core test
pnpm --filter @mykaoyan/web test
pnpm --filter @mykaoyan/api test
cargo fmt --manifest-path cli/Cargo.toml --check
cargo clippy --manifest-path cli/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path cli/Cargo.toml --locked
```
