# 26: 真题试卷发布（结构化题面 + 登录后答案）

**What to build:** 管理员用 CLI 发布结构化试卷（科目/年份/来源/逐题题面/选项/答案/解析/考点）；访客浏览已上架题面，答案只在登录后的单独答案页可见。

**Blocked by:** 14（发布令牌与契约模式）、08（管理员上下架）、13（Rust CLI）

**Status:** ready（规范已批准：`docs/specs/0004-past-paper-publishing.md`、`docs/adr/0016-past-paper-publishing.md`；红线已更新）

- [ ] 迁移：`papers`、`paper_questions`、RLS、公开角色无表权限、级联删除
- [ ] drizzle schema 与包导出
- [ ] core：`publishPaperSchema` / `paperQuestionSchema` / `publishPaperResultSchema` 与单测
- [ ] `generate-contract`：OpenAPI 路径与组件、`apps/web/public/schemas/publish/v1/paper.schema.json`；CLI 契约同步、重复生成无差异
- [ ] 发布 API：`PUT /api/v1/publish/papers/{slug}`，事务 upsert、题号唯一/升序、幂等、默认下架、更新版本 +1
- [ ] 公开 API：列表、题面详情（无答案）；答案接口登录校验（401/404）与 `no-store`
- [ ] 管理员上下架支持 `paper` 并写 `listing_changes` 审计
- [ ] CLI：`publish-paper paper.json`、`--dry-run`、`--json`、mock 测试
- [ ] 页面：`/exams`、`/exams/{slug}`、`/exams/{slug}/answers`（登录跳转、`noindex`）、导航入口
- [ ] 测试：契约、迁移、API、CLI、公开页不含答案、登录后答案可见
- [ ] 文档：spec 0004、ADR 0016、PLAN 红线、GLOSSARY、CLI README
- [ ] 本机端到端：发布虚构试卷、公开详情不含答案、登录后答案接口返回答案
- [ ] 生产：迁移与首次真题发布需站主批准；授权由站主负责

**红线：** 未授权真题内容不上站；官方公告原件不上站；答案不进公开页面/索引/搜索/OG/sitemap；真题内容不进仓库。

**验收命令：**

```bash
pnpm fmt && pnpm lint && pnpm typecheck && pnpm test && pnpm build
cargo fmt --manifest-path cli/Cargo.toml --check
cargo clippy --manifest-path cli/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path cli/Cargo.toml --locked
```
