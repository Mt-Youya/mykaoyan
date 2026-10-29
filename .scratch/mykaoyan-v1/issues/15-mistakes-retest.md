# 15: 错题与复测

**What to build:** 考生记录错题与订正，按订正后 2 天、再隔 5 天收到复测；复测结果决定错题是否稳定或重新开始；逾期显示天数。

**Blocked by:** 10（进度文件云端读写（网页））

**Status:** ready-for-human（本地完成并做过浏览器实测；真实 API 与线上验收待环境）

- [x] 复测推算按 PLAN §5.6 重写为纯函数，表格驱动测试覆盖：首次、独立完成两次、提示后完成重置、不会重置、逾期、补录过去日期
- [x] 错题的下次复测日期、次数、是否稳定、逾期天数都由记录推算，不单独存
- [x] 错题列表、记录、订正、复测页面（实现存在；未做浏览器交互实测）
- [x] 错题数据是进度文件的一部分，上传下载往返无损

## 现状（2026-10-28）

`packages/core/src/mistakes` 已实现复测推算（`getRetestState`）、到期排序（`getDueRetests`）与追加复测（`recordRetest`）；`apps/web/src/features/mistakes/mistakes-page.tsx` 已提供录入与复测页；进度文件 schema 含 `mistakes`。复选框未逐条核销。

## Comments

### 2026-10-29 实现与验收

- `packages/core/src/mistakes/index.ts` 已是纯函数：`getRetestState` 只读订正日期与原始复测记录，返回 `stable`／`attempt`／`nextOn`／`overdueDays`；`getDueRetests` 只排序不写状态；`recordRetest` 只追加原始记录。逐条比对 PLAN §5.6 后确认行为一致，因此没有为「重写」而重写实现，而是用表格测试把规格锁死（无行为变更）。
- `packages/core/src/mistakes/index.test.ts`：15 项。表格驱动覆盖首次（含到期当天不算逾期）、两次独立完成稳定、提示后完成重置、不会重置、第二次前失败回到第一次、逾期天数、补录过去日期；另测到期排序（排除稳定与未到期、逾期最久在前）、`recordRetest` 允许补录但不早于上次、非法日期、派生字段被 schema 拒绝、进度文件序列化往返逐字段相等。
- `apps/api/src/progress/progress.test.ts`：新增「错题随进度文档上传下载往返无损，派生字段不落库」——真实 NestJS + 临时 Postgres 上 GET 现有文档，整份替换为仅含一条错题的文档后 PUT，再 GET 读回；`data.mistakes` 与上传完全相等，且读回字段集合不含 `stable`／`nextOn`／`attempt`／`overdueDays`。测试手机号 `18800000008` 全仓库唯一（`mk/TOOL-09`）。
- 页面：`/mistakes` 路由已存在并在学习工作台可见，提供错题列表（按创建时间倒序）、记录（科目、来源、题面与作答摘要、订正、错因）、复测（独立完成／提示后完成／不会，仅到期可点）与逾期天数显示。

#### 验证结果

| 项目 | 结果 |
| --- | --- |
| `pnpm fmt:check` | 全仓通过（348 文件） |
| `pnpm lint` | 0 error，32 个既有 warning |
| `pnpm typecheck` | 全仓通过 |
| `pnpm test` | exit 0；45 个测试文件、678 项全部通过（0 跳过） |
| `pnpm build` | 通过（仅第三方 `use client` 警告） |
| 单文件 | `packages/core` 的 `mistakes` 15 项；`apps/api` 进度接口 2 项 |
| 变异检查 | 把 `correctedOn + 2` 改为 `+3`，4 项测试变红；恢复后 15/15 绿 |
| 浏览器实测、真机实测 | 跳过：本轮验收在纯函数与 HTTP 往返层，页面为既有实现，未做浏览器交互实测 |
| 线上验收 | 未执行，等部署与登录环境 |

#### 已知未覆盖（本轮未改）

- 乱序复测记录：`retestAttemptSchema` 只描述「按日期升序」但不校验，而 `getRetestState` 依赖数组顺序；上传一份倒序 `retests` 的进度文件会静默算错 `nextOn`／`overdueDays`。修法（排序后推算 vs 校验拒绝）属行为变更，待决定。
- 稳定后追加复测：`recordRetest` 不拦截，`getRetestState` 因提前返回而忽略；§5.6 未定义该行为，UI 在稳定后也不提供复测按钮。
- 页面「逾期 N 天」文案只有实现、没有自动化测试。

#### 备注

- 本机 `LC_ALL`／`LANG` 未设置时，Postgres 15 会因「postmaster became multithreaded during startup」起不来；跑集成测试需 `LC_ALL=en_US.UTF-8 pnpm test`。这是环境问题，未改仓库脚本。

### 2026-10-29 收尾：乱序复测、稳定后追加与页面实测

上一轮「已知未覆盖」的三项已处理，行为变更都用测试锁定：

1. **乱序复测记录：选「排序后推算」而不是「校验拒绝」。** `getRetestState` 先按 `on` 升序复制一份再折叠，上传的进度文件即使 `retests` 倒序也不会静默算错 `nextOn`／`overdueDays`；磁盘上的记录顺序不被改写，也不引入新的上传失败路径。公开 schema 的描述同步改为「推算时按日期先后排序，同一天的多条按记录顺序」，并重新生成四个契约产物（网站 JSON Schema、网站 OpenAPI、skill 随包 schema、CLI OpenAPI）。
   - `recordRetest` 的日期下限改为与最晚一条比较（乱序输入下不会被最后一条蒙混）；同时要求**严格晚于**已有复测，同一天不能重复记录——§5.6 的复测间隔是 2／5 天，同日多条没有语义，且只可能来自上传文件。同日记录在推算时按数组顺序处理（`toSorted` 稳定排序）。
   - `packages/core/src/mistakes/index.test.ts` 新增「乱序复测记录」2 项、乱序补录下限 1 项、同日重复 1 项、`isRetestDue` 到期判断 1 项：倒序两次独立 → 稳定；倒序「独立 + 失败」仍按真实先后重置；并断言推算不改写数组顺序。
2. **稳定后追加复测：选「拒绝」。** §5.6 只把「两次独立完成，错题稳定」定义为结果，没有定义稳定后再复测；页面稳定后也不给入口。决定：`recordRetest` 对已稳定错题抛「错题已稳定，不再追加复测」，上传文件里稳定点之后的记录仍按终态忽略（未扩大范围）。新增 1 项测试。
3. **页面「逾期 N 天」文案**：单条错题渲染抽成 `MistakeItem`，新测试 `apps/web/src/features/mistakes/mistakes-page.test.tsx` 用 `renderToStaticMarkup` 覆盖 4 项：逾期天数与三个复测按钮、未到期只显示计划日期且无按钮、稳定态文案且无按钮、「独立完成」一次后进入第 2 次复测。

#### Review 处理（Standards / Spec 两轴）

- **契约漂移（硬性）**：实现容忍乱序后，公开 schema 仍写「按日期升序排列」。已改描述并重新生成契约产物，contract 测试（schema 与 skill 副本一致、fixture 结论一致）通过。
- **同日边界**：`recordRetest` 从「不得早于」改为「必须晚于最晚一条」，补同日与乱序两项测试，并在代码注释与 schema 描述里写清同日记录的推算顺序。未采纳把同日写入保留为合法的方案，避免依赖数组顺序的不变式。
- **业务规则在前端复算**：core 新增 `isRetestDue(state, today)`，`getDueRetests` 与页面共用；`ARCHITECTURE.md` 的「apps/web 不含业务规则」不再被这一行违反。
- **冗余转发与类型暴露**：`MistakeItem.onRetest` 收成 `(result) => void`，父级绑定错题 id；`MistakeItemProps` 不再导出；测试覆盖参数的 `Record<string, unknown>` 换成 `Partial<z.input<typeof mistakeSchema>>`。
- **未采纳**：页面未给 `recordRetest` 抛错加 try/catch。到期且未稳定才渲染按钮，稳定由页面状态直接判断、未来日期记录算出的 `nextOn` 必在未来，两条抛错路径在页面交互中不可达；按仓库「不为不可能场景加错误处理」的取舍，只保留纯函数守卫。

#### 浏览器实测（本地 dev + 桩 API）

本机没有 Postgres／python3，真实 API 起不来；为覆盖页面交互，用仓库外的临时桩服务（只实现 `/api/v1/progress` 的 GET/PUT，含一条逾期错题）配合 `vite dev` 的 `/api` 代理，在真实 Chrome（156，CDP 驱动，视口 758×482）里验证（review 修改后用最终代码重跑一次）：

| 步骤 | 结果 |
| --- | --- |
| 打开 `/mistakes` | 标题、桩错题、`第 1 次复测 · 逾期 8 天`、三个复测按钮都出现 |
| 点「独立完成」 | 变为 `第 2 次复测 · 计划 2026-11-03`，逾期文案与按钮消失，无控制台异常 |
| 刷新页面 | 仍为第 2 次复测且无按钮：PUT 被桩服务接收、GET 读回生效 |
| 控制台 | 无异常或错误日志 |

限制：桩服务不连数据库、不校验会话；真实 API + Postgres 的往返仍由上一轮的 `apps/api/src/progress/progress.test.ts` 覆盖，本轮未在本机运行。

#### 验证结果（本轮）

| 项目 | 结果 |
| --- | --- |
| `pnpm fmt:check` | 通过（351 文件） |
| `pnpm lint` | 0 error，31 个既有 warning |
| `pnpm typecheck` | 全仓通过 |
| `pnpm --filter @mykaoyan/core test` | 84 项通过（mistakes 21 项） |
| `pnpm --filter @mykaoyan/web test` | 51 项通过（错题页 4 项） |
| `pnpm exec vitest run tests` | 108/109 通过；唯一失败是既有的 Windows 路径分隔符断言 `tests/architecture/rules.test.mjs:91`（`apps\web\src\globals.css` vs `apps/web/src/globals.css`），与本次改动无关 |
| `pnpm build` | 通过（仅第三方 `use client` 警告） |
| `pnpm test`（全仓，含真实 Postgres） | 跳过：本机无 Postgres／python3，无法起 `mykaoyan_test` 临时库 |
| 真机实测 | 跳过 |
| 线上验收 | 未执行，等部署与登录环境 |

#### 本机环境备注

- `core.autocrlf=true` 让检出文件是 CRLF，而 `.oxfmtrc.json` 要求 LF，所以首次 `pnpm fmt:check` 会在 53 个既有文件上报错；`pnpm fmt` 归一后即通过，不改变提交内容。
- 仓库 `.agents/skills/mykaoyan`、`.claude/skills/mykaoyan` 在 Windows 上会被 `postinstall` 换成 junction，而 git 以 symlink 记录（`core.symlinks=false`），`git status` 会显示删除；skill 的 contract 测试需要 junction 存在。本轮把这些写成 `mk/TOOL-10`：先 `node scripts/link-skills.mjs` 跑测试，收尾 `git checkout --` 恢复 git 记录，提交只包含本工单相关文件。


