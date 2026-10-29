# 15: 错题与复测

**What to build:** 考生记录错题与订正，按订正后 2 天、再隔 5 天收到复测；复测结果决定错题是否稳定或重新开始；逾期显示天数。

**Blocked by:** 10（进度文件云端读写（网页））

**Status:** ready-for-human（本地完成；浏览器实测与线上验收待环境）

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
