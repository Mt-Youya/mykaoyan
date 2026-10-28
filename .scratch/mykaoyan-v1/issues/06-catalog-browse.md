# 06: 课程、章、讲、讲义的浏览

**What to build:** 访客能浏览已上架的课程、章和讲，阅读讲稿和讲义，数学公式正确显示；下架的内容访客看不到。

**Blocked by:** 02（Hello 全链路上线）、03（数据库迁移管线与备份）

**Status:** ready-for-human（本地完成并做过浏览器实测；待站主验收）

- [x] 课程、章、讲、讲义有表结构与迁移；上架状态与内容字段分开存
- [x] 访客可以按考试科目进入课程，看到章和讲的顺序列表
- [x] 讲稿与讲义的 Markdown 渲染支持 GFM 与数学公式
- [x] 未上架的内容通过接口与页面都访问不到（返回 404）
- [x] 页面在手机宽度下可用
- [x] 只用虚构的示例内容

## 本轮交付说明

表结构与迁移：`packages/db/src/catalog/index.ts`（courses/chapters/lessons/handouts，`listed` 与内容字段分列），迁移 `20261027045117_lively_thunderbird.sql`。
接口：`GET /api/courses?subject=`、`/api/courses/:slug`、`/api/lessons/:slug`、`/api/handouts`、`/api/handouts/:slug`；上架链任一级下架即 404，测试见 `apps/api/src/catalog.test.ts`（7 个）。
页面：`apps/web/src/features/catalog/` 与 4 个路由；Markdown 用 react-markdown + remark-gfm + remark-math + rehype-katex。
实测：Chromium 375×812 与 1280×900 共 26 项检查全过；5 个页面 `scrollWidth` 均为 375，无横向滚动；4 个未上架 URL 不泄露任何内容（页面是「内容不存在」错误态，接口是 404 problem+json）。
未做：真机、Safari/Firefox、读屏软件；SSR 首屏只有加载态（数据在浏览器端拉取），后续要 SEO 需改 loader 或服务端取数。
