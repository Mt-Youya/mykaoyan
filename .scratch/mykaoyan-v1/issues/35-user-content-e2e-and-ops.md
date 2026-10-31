# 35: 用户内容端到端验收、运维文档与开放前核查

**What to build:** 用真实 API + 临时 Postgres 跑通虚构内容的完整链路，补齐运维说明与社区开放前核查清单；确认规格、ADR、术语与权限矩阵在实现后没有漂移。

**Blocked by:** 30、32、33、34（以及 27 的投稿评论）

**Status:** ready-for-agent

**Spec:** [规划 0005](../../../docs/specs/0005-user-uploads.md)｜**ADR:** [0017](../../../docs/adr/0017-user-content-uploads.md)

- [ ] 端到端（虚构内容，禁止真实真题/答案）：视频 + 字幕投稿 → 审核上架 → 访客播放与字幕；手稿提交 → 待审核 → 通过上架 → 阅读；用户试卷提交 → 待审核 → 通过上架 → 题面公开、答案按会员/本人/管理员分流；评论与评分权限；下架后公开出口消失
- [ ] 清理链路：驳回视频满 30 天（用时间偏移验证）删对象与字幕；手稿正文清空；用户试卷驳回后仅本人/管理员可见
- [ ] 社区关闭回归：公开列表空、上传/评论/评分被拒、本人与管理员可预览、管理员审核通过但不上架
- [ ] IDOR 回归：别人的投稿、字幕、试卷、我的列表全部 404/403
- [ ] 运维文档：新增/更新 `docs/ops/` 说明（用户内容开放条件、权限、清理、容量观察、故障处理）；更新 `docs/ops/submissions.md` 的形态与字幕说明；如有必要新增 `docs/ops/user-content.md`
- [ ] 更新 `docs/delivery/community-launch-readiness.md`（开放前核查）：用户内容审核、权利声明、答案隔离、举报入口等新增项
- [ ] 回读核对：PLAN §3 权限表、§5.3、§9；GLOSSARY 投稿/手稿/字幕/用户试卷/评论/审核；规格 0005 与 ADR 0017 与实现一致，发现漂移先改文档再收尾
- [ ] 交付报告分开写：静态检查、构建、本地运行、浏览器实测、真机实测；跳过的写跳过

**验收标准：** 虚构内容全链路通过并留下证据；清理与社区开关行为符合规格；运维与开放前核查文档可执行；文档与代码无权限口径冲突。

**红线：** 不把真实真题、答案或用户数据放进仓库、测试、日志；不 commit/push/部署；迁移生产库需站主批准；不开启社区（`COMMUNITY_ENABLED` 保持默认关闭）。

**验收命令：**

```bash
pnpm fmt && pnpm lint && pnpm typecheck && pnpm test && pnpm build
cargo fmt --manifest-path cli/Cargo.toml --check
cargo clippy --manifest-path cli/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path cli/Cargo.toml --locked
```
