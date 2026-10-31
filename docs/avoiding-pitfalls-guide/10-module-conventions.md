# 10 · 模块与导入规约

> 框架文档的默认目录结构与站主自己的规约不是一回事；这一章收的是重构前后“谁说了算”的冲突。

### MOD-01 · 按框架默认摊平 `apps/api` 并用 NodeNext 强制 `.js` 后缀：站主连发 6 条纠正才落到域目录 + 省略扩展名

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-93af4232-94a9-4c3e-83f5-d83473bf640f（dsh--session-93af4232-9…md 第 13048–13062、14044–14056、15812–15885、16271–16314、16316–16330、16704–16728、17408–17429 行）

**1. 怎么出现的**
用户贴出 NestJS 默认文件清单问“能不能按照人家 nestjs 都要求做”，agent 随即把 `application.ts` 拆成根级 `app.controller.ts`/`app.module.ts` 等平铺文件；当时 import 全是 `./x.js`，来自 `tsconfig.base.json` 的 `NodeNext`。之后用户连续纠正：文件要收进 `src/app`、不要 `.js` 后缀、不要 `index`、用 `export *`——前后 6 条。

**2. 怎么诊断的**
每条纠正都是一次实测：先解释 NodeNext 的硬性要求并给 A/B/C 三选一；用户拒 esbuild 后才发现 TypeScript 5.7+ 的 `rewriteRelativeImportExtensions`；再改成 `moduleResolution: bundler` + `tsx` 运行时，最后用正则清掉 31 个文件的 `/index`。

**3. 提了什么方案**
NodeNext + tsc emit（第一版，全仓 `.js`）；`.ts` + esbuild（用户否）；`moduleResolution: bundler` + 省略扩展名 + `index.ts` 全部 `export *` + build 只做类型检查 + start 用 tsx（采用）。

**4. 最后怎么处理的**
提交后 fmt/lint/typecheck/test(447)/build 全绿；代价是 `tsc` 不能 emit 可运行 `dist`，架构守卫被多次放宽来接受省略扩展名的目录入口。用户消息里的 `ts-rs` 半句被静默丢掉。重构目录或 tsconfig 前先问清目标布局与 import 规约。

- 📎 excerpt: [evidence.gz](./evidence.gz) → MOD-01
