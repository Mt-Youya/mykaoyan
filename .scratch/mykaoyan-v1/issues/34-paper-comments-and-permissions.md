# 34: 用户试卷评论与权限矩阵收尾

**What to build:** 用户试卷评论（`paper_comments` / `paper_comment_deletions` 的 API 与前端），并把权限矩阵收尾到与站主决定一致：非会员上传可用、评论/评分/看答案要会员、上传者本人免会员评论其投稿与试卷、上传者可看自己试卷答案、管理员可删评论留审计。

**Blocked by:** 28（迁移）、32（用户试卷 API）、27（投稿评论先例）

**Status:** ready-for-agent

**Spec:** [规划 0005](../../../docs/specs/0005-user-uploads.md)｜**ADR:** [0017](../../../docs/adr/0017-user-content-uploads.md)

- [ ] API：`GET/POST /api/papers/:slug/comments`（会员或试卷上传者本人可写；一层回复；关键词过滤；已上架且社区开放可读；未登录 401、非会员且非本人 403）；`GET/DELETE /api/admin/paper-comments`（管理员列表/租户删除与审计，原因 1–500）
- [ ] 前端：用户试卷题面/答案页下评论组件（复用现有评论组件与投稿评论交互），访客可读、非会员看到会员入口、上传者本人看到「本人上传」免会员提示
- [ ] 权限矩阵回归：逐格核对「访客/账号/非会员/会员/过期会员/上传者本人/管理员 × 上传、评论、评分、看答案、我的内容、管理接口」，与规划 0005 §6 一致
- [ ] 修正现有 UI/文档中的旧口径：投稿入口不再要求会员；`docs/ops/submissions.md`、`docs/ops/comments.md` 若有「会员才可投稿」或「评论只在讲」的旧表述，按本规格更新（`docs/ops/comments.md` 由 ticket 27 负责时只补试卷评论段落）
- [ ] 测试：上传者本人免会员评论；非上传者非会员仍 403；访客可读已上架试卷评论；已删除评论显示「已删除」；管理员删除写审计；未上架/社区关闭不可见
- [ ] 与 ticket 27 的投稿评论保持同一套规则与文案，不改造已验收的 `comments`（讲）表

**验收标准：** 用户试卷下评论链路可用；上传者本人免会员评论在其投稿与试卷两处均成立；非会员/访客行为正确；权限矩阵测试逐格通过；旧口径文档已修正。

**红线：** 评论接口不用 Agent 令牌；删除保留审计、不物理删除记录；不把讲评论表改成多态；不写真实内容。

**验收命令：**

```bash
pnpm --filter @mykaoyan/api test
pnpm --filter @mykaoyan/web test
pnpm typecheck && pnpm build
```
