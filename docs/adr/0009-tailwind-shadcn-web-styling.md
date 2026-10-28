---
status: accepted
---

# 网页样式一律用 Tailwind v4 + shadcn，不再写页面级 CSS

站主在 2026-10-27 明确要求：`apps/web` 用 shadcn + Tailwind CSS 实现界面。此前 `docs/PLAN.md` §7 也早已把 `tailwind v4`、`shadcn（base-ui）` 写进前端技术方案，但实际实现走了另一条路：

- `apps/web` 从未安装 `tailwindcss`，也没有 `components.json` 与 Tailwind 的 Vite 插件；
- `packages/ui/src/styles/globals.css`（shadcn 的主题文件）自 initial commit 起是 0 字节空文件；
- `packages/ui` 没有被任何包依赖，63 个 shadcn(base-ui) 组件全是死代码；
- 全部界面样式是 6 个手写 CSS 文件、约 1300 行、81 个自定义类名（`styles.css`、`-home/{tokens,base,home,study}.css`），文件头标注由 Hallmark 流程产出。

也就是说：设计流程（Hallmark 输出手写 CSS）与既定技术栈（Tailwind + shadcn）冲突，而没有任何一处记录约束了「设计产物如何落到代码」，于是页面级 CSS 一直增生。

## Considered Options

- **保留手写 CSS，只把 Hallmark 的结果整理干净**：与站主明确要求、`PLAN.md` §7 都不符，且每新增一页就多一份无法复用的样式。
- **换一套 CSS-in-JS（StyleX、CSS Modules）**：站主点名 Tailwind + shadcn，且组件库已是 shadcn(base-ui)，没有理由再引入第三套方案。
- **Tailwind v4 + shadcn(base-ui)，页面不允许有自己的 `.css` 文件**（采纳）。

## Consequences

- `apps/web` 依赖 `tailwindcss`、`@tailwindcss/vite`、`@tailwindcss/typography`，并在 `vite.config.ts` 注册 Tailwind 插件；`apps/web/components.json` 指向 `packages/ui` 的 shadcn 主题。
- 设计令牌唯一来源是 `packages/ui/src/styles/globals.css`：把 `DESIGN.md` 的 OKLCH 颜色、宋体/无衬线字体栈、74rem 内容宽、阅读留白映射成 shadcn 语义变量与 Tailwind `@theme` 令牌（`page-container`、`py-section`、`px-gutter`、`gap-column`、`text-hero`、`text-section`、`reading:` 断点）。改视觉先改 `DESIGN.md` 与这套令牌，不在页面里就地取值。
- 页面样式只用 Tailwind 工具类与 `@mykaoyan/ui` 组件；禁止新增页面级 `.css`、禁止内联 `style`、禁止再维护 BEM 类名。`apps/web/src/globals.css` 是全站唯一 CSS 入口。
- 组件从包入口 `@mykaoyan/ui` 按需引入（`packages/ui/src/index.ts` 负责导出），不深层导入 `@mykaoyan/ui/base/*`，与 `ARCHITECTURE.md` 的「跨领域只导入入口文件」一致；新增组件时在入口补一行导出。
- 删除 `apps/web/src/routes/styles.css` 与 `apps/web/src/routes/-home/{tokens,base,home,study}.css`。
- `tests/architecture/rules.test.mjs` 增加守卫：`apps/web/src` 只允许一个 `.css` 文件、JSX 不写内联 `style`、旧 BEM 类名不得回流。
- Hallmark 仍然负责设计方向与评审，但它的产物是 `DESIGN.md`、原型与设计判断，不是可以直接提交的手写 CSS；落地实现必须走 Tailwind + shadcn。
- 设计稿固定为纸白浅色，`dark:` 变体绑定在 `.dark` 类上而不是系统偏好，避免组件在深色系统下变黑。
- 迁移不做视觉重设计：颜色、字号、间距、断点、文案、语义标签、无障碍属性按原实现等价翻译。
