# 研招网目录查找面板：4 处修复只读复查

- 时间：2026-10-28 10:07–10:40（Asia/Shanghai）
- 范围：`apps/web/src/routes/-home/target-lookup.tsx`、`apps/web/src/routes/-home/profile-form.tsx`、`apps/web/src/routes/index.tsx`
- 只核对上一轮 `admissions-visual.md` 问题清单里的 4 处修复（长专业名溢出、链接常驻下划线、页脚品牌链接点击区、查询中可见反馈）+ 回车回归与控制台
- 手段：Chrome 156 无头 + CDP（真实鼠标/键盘事件驱动；`getComputedStyle` 读数值；`canvas` 把 oklch 换算成 sRGB 后算 WCAG 对比度）
- 约束遵守：未登录学信网、未保存或输出 Cookie/令牌、未改任何代码/样式/配置、未提交或 push；研招网请求只由面板操作自身触发（北京工业、0854 筛选、085404 条目几组，含必要重测），没有额外批量查询

## 启动与端口（与上一轮相同，但有端口冲突）

| 服务 | 命令 | 结果 |
| --- | --- | --- |
| API（第一次） | `apps/api` 下 `../../node_modules/.bin/tsx src/main.ts`，`NODE_ENV=test PORT=3101 DATABASE_URL=postgres://localhost:5432/mykaoyan_test MEDIA_SIGNING_KEY=local-acceptance-key-at-least-32-chars` | 3001 当时被**另一会话**的 tsx 占用（10:05:45 启动，非本会话），按约束换到 3101；`curl 127.0.0.1:3101/api/admissions/year` → `{"year":2027,...}` ✅ |
| 前端 | `apps/web` 下 `node_modules/.bin/vite --host 127.0.0.1 --port 5173` | 3000 被另一会话 vite 占用，实际端口 **5173** ✅ |
| API（最终） | 10:30 左右另一会话占 3001 的 API 进程自行退出（端口空出）；10:33 把本会话 API 改起在 **3001**，环境变量同上 | `curl 127.0.0.1:3001/api/admissions/year` → `{"year":2027,...}` ✅ |

说明：

- `apps/web/vite.config.ts` 的 `nitro devProxy` **硬编码** `http://127.0.0.1:3001`，按约束不能改配置，所以前端 `/api` 只能经 3001 转发；最终把 API 落在 3001 后，面板请求才与"上一轮相同"的链路一致。
- 10:29–10:30 之间 3001 上游短暂不存在，vite 代理返回过 500（"Dev server is unavailable"）；该次只影响延迟项的一次补测，恢复后已重测，下面所有数据均来自 200 成功链路。
- 未停止任何其他会话的进程。

## 逐项复查

### 1. 长专业名不再横向溢出 —— **通过**

操作：375×812（dpr 2）进入「设置我的备考」→ 输入"北京工业"→ 选 `10005 北京工业大学` → 学科类别输入 `0854` → 「筛选专业」。

375 视口关键数值：

| 指标 | 实测 |
| --- | --- |
| `document.documentElement.scrollWidth` | **375**（`body.scrollWidth` 也是 375，`overflowX = 0`） |
| 长按钮 `085402 通信工程（含宽带网络、移动通信等）` | `width 327px`、`right 351px`、`height 66px` |
| 面板（`fieldset[aria-busy]`）右边界 | `right 351px` → 按钮右边界 **等于**面板右边界，未越界（`panelOverflow = 0`） |
| 文字换行 | `lines = 2`，`textRight 319.94px`（< 351），`whiteSpace: normal` |
| 对齐 | `text-align: left`、`justify-content: flex-start`、`padding 24px/24px` |
| 高度 | 66px ≥ 44px（`min-height: 48px`，两行把高度撑到 66px） |

截图：`admissions-recheck-1-375.png`（按钮两行、左对齐、完整可见）。

1440×900（dpr 1）再测：

| 指标 | 实测 |
| --- | --- |
| `document.documentElement.scrollWidth` | 1425（=1440 减 15px 滚动条，无横向溢出） |
| 短名称按钮 `085404 计算机技术` | `height 48px`、`lines = 1`、`white-space: normal`（不换行） |
| 已选按钮 `10005 北京工业大学`（`aria-pressed=true`） | `border oklch(0.35 0.025 255)`、`background oklch(0.87 0.025 245)`、文字对比度 10.8:1 |
| 未选按钮（`085402...`，`aria-pressed=false`） | `border oklch(0.83 0.008 80)`、`background oklch(0.98 0.006 85)`、文字对比度 15.1:1 |
| 选中/未选差异 | 边框色不同 ✅、底色不同 ✅ |

截图：`admissions-recheck-1-1440.png`。

### 2. 链接常驻下划线 —— **通过**

| 位置 | 未悬停 | 悬停 | 对比度 |
| --- | --- | --- | --- |
| 招生条目「在研招网核对此条目」 | `text-decoration-line: underline`、`thickness: auto`、`underline-offset: 4px`、`color oklch(0.25 0.008 70)` | `thickness **2px**`、仍 underline；`rect` 不变（44×144） | 卡片底 `oklch(0.96 0.006 85)` → **14.2:1** ✅ |
| 第二步来源提示「条目详情」 | `text-decoration-line: underline`、`thickness: auto`、`underline-offset: 4px`、`color oklch(0.45 0.012 70)` | `thickness **2px**`、仍 underline | 页面底 `oklch(0.98 0.006 85)` → **7.04:1** ✅ |

- 两个链接都指向 `https://yz.chsi.com.cn/zsml/yjfxdetail?id=…`（`target=_blank`、`rel=noreferrer noopener`）；未打开、未登录。
- 悬停时 `text-decoration-thickness` 从 `auto` 变为 `2px`，下划线明显变粗；颜色对比度均 ≥4.5:1。
- 另记：条目链接点击区 `height 44px`（`min-h-11`），行内「条目详情」为 inline 链接、高 22px。

截图：`admissions-recheck-2-record.png`、`admissions-recheck-2-step2.png`。

### 3. 页脚品牌链接点击区 —— **通过**

两个视口都测了页脚全部链接：

| 视口 | 「我的考研」高度 | 垂直居中 | 与其他链接对齐 |
| --- | --- | --- | --- |
| 1440×900 | **44px**（`min-height: 44px`，`display:flex` + `align-items:center`） | 文本中心与链接中心差 **-0.36px** | 与「课程/讲义/公开契约/登录账号」同一行，`top/bottom` 完全一致（1119.28/1163.28），文本中心差 ≤0.36px ✅ |
| 375×812 | **44px** | 差 **-0.36px** | 与「课程/讲义/公开契约」同一行（879.8/923.8）；「登录账号」按既有 `flex-wrap` 换到第二行 ✅ |

其余页脚链接同样 44px、文本中心差 0px，品牌链接与它们视觉基线对齐。

截图：`admissions-recheck-3-1440.png`、`admissions-recheck-3-375.png`。

### 4. 查询中有可见反馈 —— **通过（中间态已捕获）**

- 用 CDP `Network.emulateNetworkConditions` 设 `latency: 2000` 后再点「查找学校」：
  - 点击后 650ms 采样：面板内出现 `p[role="status"]`，文本 **「正在查询研招网…」**，`aria-busy="true"`，「查找学校」`disabled=true`；此时 `unitButtons = 0`（旧结果已清空）。
  - CDP `requestWillBeSent → responseReceived` 实测该请求耗时 **2001ms**（延迟确实生效）。
  - 约 **2069–2074ms** 后该行消失（`statusText = null`、元素不存在）、按钮恢复可点、结果「10005 北京工业大学」出现、无 `role="alert"`。
- 一个字「北」+ 点「查找学校」：提示 **「请输入至少两个字的学校名称。」** 正常显示，元素 `role="status"`，未发请求。

截图：`admissions-recheck-4-busy.png`（375）、`admissions-recheck-4-busy-1440.png`（1440，含灰掉的按钮 + 状态行）、`admissions-recheck-4-hint.png`（375）。

## 回归检查

### 学科类别输入框回车只筛选、不提交 —— **通过**

步骤：先回到"未筛选"态（10 个专业 + 截断提示「研招网未登录时只返回前 10 个专业（共 71 个），列表不完整。」），在学科类别输入框输入 `0854` 后**只按回车**（不点按钮）：

- 回车后列表从「020200 应用经济学…」变为 `085402…085412` 十个专业，截断提示消失 → 筛选确实执行 ✅
- URL 仍为 `/`；`h1` 仍为「报考目标」；步骤条仍 `1. 报考目标`；无 `role="alert"` → 未提交表单 ✅

截图：`admissions-recheck-regression-enter.png`。

### 控制台 —— **通过（无新增业务报错）**

- 仅 1 条 error：`http://127.0.0.1:5173/favicon.ico` 404（既有、与本次修复无关）。
- 其余为 3 条 TanStack Router 的 dev 警告（`HomePage`/`LoginPage`/`ContractPage` 未 code-split），非报错。
- `/api` 请求全部 200：招生目录查询正常；课程/讲义目录返回 **200 + 空数据**（当前 API 有 `catalog/empty.ts` 兜底，本轮**没有出现** 500）。
- 离开首页进入表单时 4 个课程/讲义请求被浏览器标为 `ERR_ABORTED`（React 卸载取消请求，非控制台报错），重新进首页后 4 个请求均 200。

## 收尾

- 已停止本会话启动的 API（3001）与前端（5173）：两个端口均已释放；CDP Chrome 已退出。**未停止**其他会话的 `vite --host --open`（3000）与 `tsx watch` 进程。
- `git status`：本会话**没有手改任何受跟踪文件**。本会话只产出：
  - 本报告（未跟踪）：`.scratch/admissions-visual-recheck.md`
  - 截图：`design/explorations/screenshots/admissions-recheck-*.png`（`design/` 在 `.gitignore` 内）
- 但工作区期间被并行会话持续写入（10:24 之后仍在变），需要说明（**不是本会话所改**）：
  - ` M apps/web/src/routeTree.gen.ts`：TanStack Start 的**生成文件**，10:27:03 随并行会话新增的 `apps/web/src/routes/vocabulary.tsx`（同为 10:27:03）被 dev server 重新生成，diff 只有 `/vocabulary` 路由相关 21 行；本会话启动的 vite 也在 watch 同一文件，但内容来自并行会话的新路由，非本轮手改。
  - ` M packages/core/src/index.ts`、`?? apps/web/src/features/vocab/`、`?? apps/web/src/routes/vocabulary.tsx`、`?? packages/core/src/vocab/`：并行会话的词汇功能改动（10:24–10:27 写入）。
  - 复查收尾时又出现 ` M packages/core/src/progress/*`、` M packages/db/*`、`?? packages/db/src/progress/`、`?? packages/db/supabase/migrations/20261028090000_progress_documents.sql` 等：同一批并行会话的学习进度功能改动，出现在本会话开工之后、与本轮无关。
  - 其余 `M/A/MM/D` 条目（含 admissions、target-lookup/profile-form/index.tsx 等）在 10:07 开工时就已经存在，与本轮复查无关。
  - 结论：`git status` 的受跟踪改动里，能追溯到本会话的只有 dev server 自动生成的 `routeTree.gen.ts`（且由并行会话的新路由触发），没有任何本轮手写的代码/样式/配置改动。

## 未捕获 / 限制

- 中间态已捕获，无"未捕获"项。
- 仅 Chrome 无头模拟 375×812 / 1440×900，未做真机触摸；`prefers-reduced-motion`、暗色模式不在本次复查范围。
- 截图右下角 TanStack Router 开发面板是 dev-only 工具，不属于产品 UI。
