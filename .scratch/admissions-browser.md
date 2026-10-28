# 招生目录查询验收（后端 + 前端浏览器走查）

- 验收时间：2026-10-27 17:38–18:05（Asia/Shanghai）
- 对象：`apps/api/src/admissions`、`apps/web/src/routes/-home/target-lookup.tsx`
- 约束：未提交、未 push、未部署；未修改任何代码或配置文件；未改 `.env`；未登录学信网；未保存或输出 Cookie/令牌。
- 研招网请求全部由后端发出，沿用后端自身的串行限速与缓存；浏览器走查未触发额外批量查询（同一单位/专业的重复查询命中后端缓存）。

## 环境说明（影响复现）

1. `pnpm exec` 在本机无法启动：根 `package.json` 固定 `pnpm@12.15.1`，该版本在公共源不存在（`https://registry.npmjs.org/pnpm/12.15.1` 返回 404）。按任务要求改用各包 `node_modules/.bin`（`apps/api` 下没有 `.bin/vitest`、`.bin/tsx`，使用根目录 `../../node_modules/.bin/*`）。
2. 开始第二轮时 `apps/api/node_modules` 里的 Nest/rxjs/reflect-metadata 已被并发的安装操作删除（虚拟存储只剩 web 依赖），导致测试报 `Cannot find package 'reflect-metadata'`。用本机已有的 pnpm 12.15.0 二进制执行
   `pnpm install --frozen-lockfile` 恢复依赖：只重建 `node_modules`，**未改动 `package.json` / `pnpm-lock.yaml`**。
3. 工作区同时有另一个会话在改代码并执行 `git add`（本轮期间新增了 README、`apps/api/src/main.ts`、`apps/web/src/routes/__root.tsx`、`styles/globals.css`、`docs/adr/0009-*` 等改动）。本报告末尾的 `git status` 包含这些并行改动；**本次验收没有编辑任何受跟踪文件**。

## 一、HTTP 级接口测试

命令（指定命令；`apps/api` 下无 `.bin/vitest`，用根目录二进制）：

```bash
cd apps/api && ../../node_modules/.bin/vitest run src/admissions/admissions.test.ts
```

结果：

```text
 RUN  v5.0.5 /Users/yonjay/codes/hubs/mykaoyan/apps/api
 ✓ src/admissions/admissions.test.ts (18 tests) 201ms

 Test Files  1 passed (1)
      Tests  18 passed (18)
```

- 通过数：**18**
- 失败数：**0**
- 失败用例：无

## 二、启动本地服务

### 1. API

在 `apps/api` 目录以指定环境变量启动（`node_modules/.bin/tsx` 不存在，使用根目录 `../../node_modules/.bin/tsx`）：

```bash
NODE_ENV=test PORT=3001 \
DATABASE_URL=postgres://localhost:5432/mykaoyan_test \
MEDIA_SIGNING_KEY=local-acceptance-key-at-least-32-chars \
../../node_modules/.bin/tsx src/main.ts
```

验证：

```bash
curl -sS http://127.0.0.1:3001/api/admissions/year
# {"year":2027,"checkedAt":"2026-10-27T09:48:47.406Z","stale":false}
```

- 年度为 **2027**，符合预期。

### 2. 前端

在 `apps/web` 目录启动：

```bash
node_modules/.bin/vite --host 127.0.0.1
```

- 3000 已被并行会话占用，3001 被 API 占用，Vite 自动选择 **3002**。
- 实际地址：`http://127.0.0.1:3002/`
- 代理验证：`curl http://127.0.0.1:3002/api/admissions/year` → 200，`{"year":2027,...}`，Nitro `devProxy` 转发正常。
- 首页课程/讲义目录因为 `DATABASE_URL` 指向不存在的库而显示“课程暂时无法加载，请稍后重试”，符合任务说明的预期。

## 三、浏览器走查

使用 Playwright 1.58（Python）+ Chromium，无头模式，视口 1280×900（第 9 项切到 375×812）。全程记录 console、pageerror、network。截图保存在 `design/explorations/screenshots/`。

### 1. 学校名称输入“北京工业”后回车

- 输入框下方出现按钮 **「10005 北京工业大学」**。
- 回车后标题仍是 **“报考目标”**（第 1 步），URL 仍为 `/`，没有进入“考试组合”——整张表单未被提交。
- 截图：[admissions-03-units.png](../design/explorations/screenshots/admissions-03-units.png)

### 2. 点选该校

- 专业列表 **10 个**：020200 应用经济学、0202J1 资源环境与循环经济、025100 金融、025200 应用统计、030300 社会学、030500 马克思主义理论、035102 法律（法学）、035200 社会工作、035400 知识产权、040100 教育学。
- 提示原文：**“研招网未登录时只返回前 10 个专业（共 71 个），列表不完整。”**
- 截图：[admissions-04-majors.png](../design/explorations/screenshots/admissions-04-majors.png)

### 3. 按学科类别筛选 0854 / 清除筛选

- 输入 `0854` 点“筛选专业”后，列表内容变为 **0854 下的 10 个专业**：085402 通信工程（含宽带网络、移动通信等）、085403 集成电路工程、085404 计算机技术、085405 软件工程、085406 控制工程、085407 仪器仪表工程、085408 光电信息工程、085409 生物医学工程、085410 人工智能、085412 网络与信息安全。
- 注意：行数仍是 10，但内容已从“前 10 个专业”变成“0854 类别下的全部 10 个专业”；接口返回 `coverage.total=10, truncated=false`，截断提示随之消失（说明不是“缩小行数”而是“换成了筛选后的完整列表”）。
- 点“清除筛选”后恢复到最初 10 个专业（与筛选前逐项相同）。
- 截图：[admissions-05-filtered.png](../design/explorations/screenshots/admissions-05-filtered.png)、[admissions-06-cleared.png](../design/explorations/screenshots/admissions-06-cleared.png)

### 4. 查询 085404 招生条目

- 085404 不在“前 10 个专业”里，按提示在“六位专业代码”输入 `085404` 后点“查询招生条目”。
- 出现 **3 条**招生条目，每条包含学院、方向、学习方式、科目组和“在研招网核对此条目”链接：

| # | 学院 | 方向 | 学习方式 | 科目组 |
| --- | --- | --- | --- | --- |
| 1 | 088 计算机学院 | 01 计算机网络技术 | 全日制 | 101 思想政治理论 + 204 英语（二） + 302 数学（二） + 408 计算机学科专业基础 |
| 2 | 088 计算机学院 | 02 计算机软件技术 | 全日制 | 同上 |
| 3 | 088 计算机学院 | 03 计算机应用技术 | 全日制 | 同上 |

- 三条的核验链接分别为 `https://yz.chsi.com.cn/zsml/yjfxdetail?id=430e…`、`6c5e…`、`c999…`。
- 截图：[admissions-07-records.png](../design/explorations/screenshots/admissions-07-records.png)

### 5. 采用第一组科目 → 下一步

- 点“采用这组科目”后提示：“已带入「088 计算机学院 · 01 计算机网络技术」的科目，请到下一步核对。”
- 点“下一步”进入“考试组合”，显示：
  - **“已按研招网 2027 目录带出科目（2026年10月27日 查询）。请对照条目详情确认；手动调整科目也可以。”**
  - **“完整考试科目：101 思想政治理论、204 英语二、302 数学二、408 计算机学科专业基础”**
- 与第 4 项条目对比：四门科目代码完全一致（101/204/302/408）；名称按站内标准名归一化（“英语（二）”→“英语二”、“数学（二）”→“数学二”），不影响科目识别。
- 截图：[admissions-08-step2.png](../design/explorations/screenshots/admissions-08-step2.png)

### 6. 上一步修改“学院”后再下一步

- 回到“报考目标”，把“学院”从 `088 计算机学院` 改为 `计算机学院-手改`，再点“下一步”。
- “考试组合”页的来源提示 **消失**（`.study-notice` 数量为 0），标题仍为“考试组合”。
- 截图：[admissions-09-source-cleared.png](../design/explorations/screenshots/admissions-09-source-cleared.png)

### 7. 重新查找 → 采用 → 当前学习范围 → 保存 → 刷新

- 重新查“北京工业”→ 选 10005 → 输入 085404 查条目 → 采用第一组 → 下一步，“已按研招网 2027 目录带出科目…”再次出现。
- 再点“下一步”进入“当前学习范围”，确认页显示：
  - `2027 招生 · 北京工业大学 · 085404 计算机技术`
  - `完整考试科目：思想政治理论、英语二、数学二、计算机学科专业基础`
  - **`科目来源：研招网 2027 招生目录，2026年10月27日 查询`**
  - `当前学习：尚未选择`
- 勾选“302 数学二”后点“保存并进入工作台”：进入工作台，标题“把今天，留给这一科。”，显示“我的备考 · 2027 招生”“当前学习范围：302 数学二”。
- 刷新页面后工作台仍在，`localStorage['mykaoyan.study-draft']` 与保存前一致，`active: ["302"]`。
- 截图：[admissions-10-confirm.png](../design/explorations/screenshots/admissions-10-confirm.png)、[admissions-11-workspace.png](../design/explorations/screenshots/admissions-11-workspace.png)、[admissions-12-reload.png](../design/explorations/screenshots/admissions-12-reload.png)

### 8. 负面检查

| 检查 | 结果 |
| --- | --- |
| 学校名称只输入 1 个字（“北”） | 提示 **“请输入至少两个字的学校名称。”** |
| 学科类别输入 085 | 提示 **“学科类别代码是四位数字，例如 0812、0854。”** |
| `curl 'http://127.0.0.1:3001/api/admissions/records?year=2026&unit=10005&major=085404'` | **409**，`Content-Type: application/problem+json; charset=utf-8`，body：`{"type":"about:blank","title":"研招网目前只提供 2027 年度的招生目录，无法查询 2026 年度","status":409}` |
| 网络面板：是否直连研招网 | 全部请求 host 只有 `127.0.0.1:3002`；**没有**任何 `yz.chsi.com.cn` 请求。招生数据请求均为本站 `/api/admissions/*`（units / majors / records）。记录条目里的“在研招网核对此条目”只是 `<a href>`，未点击、不产生请求。 |

- 截图：[admissions-13-hint-school.png](../design/explorations/screenshots/admissions-13-hint-school.png)、[admissions-14-hint-discipline.png](../design/explorations/screenshots/admissions-14-hint-discipline.png)

### 9. 375 宽布局

实测（视口 375×812）：

```json
{
  "innerWidth": 375,
  "docScrollWidth": 375,
  "bodyScrollWidth": 375,
  "panelScrollWidth": 327,
  "panelClientWidth": 327
}
```

- 页面与查找面板均无横向滚动条（`scrollWidth == clientWidth`）。
- “查找到的学校”“招生专业”按钮按行换行（截图中多行排列）。
- 截图：[admissions-15-mobile.png](../design/explorations/screenshots/admissions-15-mobile.png)

### 10. 控制台与网络

- 控制台错误：**8 条**，全部是 `Failed to load resource: 500 (Internal Server Error)`，对应 `/api/courses?subject=302`、`/api/courses?subject=408`、`/api/handouts?subject=302`、`/api/handouts?subject=408` 的重复请求——即任务说明中“课程目录因为没有数据库而报的错”，已排除。
- 除此之外 **没有其他 console error**，**没有 pageerror**。
- 招生相关请求共 10 次（含重复查询），全部为本站 `/api/admissions/*`，后端缓存使实际上游请求只发生在首次：units、majors（未筛选）、majors（0854）、records 各 1 次。

## 四、结论

| # | 验收项 | 判定 | 依据 |
| --- | --- | --- | --- |
| 1 | 输入“北京工业”回车后列出 10005 北京工业大学，且表单未提交 | **符合** | 出现“10005 北京工业大学”；标题仍为“报考目标”，URL 未变化 |
| 2 | 点选后列出 10 个专业，并提示未登录只返回前 10 个（共 71 个） | **符合** | 10 个专业；提示原文包含“研招网未登录时只返回前 10 个专业（共 71 个）” |
| 3 | 输入 0854 筛选后列表为 0854 下的专业，清除后恢复 | **符合** | 筛选后 10 条全部为 0854（085402–085412），截断提示消失；清除后恢复原 10 条且逐项相同。行数未变是因为 0854 恰好只有 10 个专业 |
| 4 | 085404 出现约 3 条招生条目，每条有学院/方向/学习方式/科目组/核验链接 | **符合** | 3 条，字段齐全，链接可读 |
| 5 | 采用后下一步显示“已按研招网 2027 目录带出科目”，“完整考试科目”与条目一致 | **符合** | 提示原文一致；四门科目代码 101/204/302/408 完全一致，名称按站内标准名归一化（括号差异） |
| 6 | 修改“学院”后再下一步，来源提示消失 | **符合** | 修改后来源提示数量为 0 |
| 7 | 当前学习范围保存后，确认页显示来源；进入工作台；刷新后选择仍在 | **符合** | 确认页含“科目来源：研招网 2027 招生目录”；工作台出现；刷新后 localStorage 与选择一致 |
| 8 | 1 个字提示、085 提示四位数字、2026 返回 409 + problem+json、网络不直连研招网 | **符合** | 两条文案均命中；409 + `application/problem+json`；请求 host 仅 127.0.0.1:3002，无 yz.chsi.com.cn |
| 9 | 375 宽无横向滚动条，按钮能换行 | **符合** | `docScrollWidth=375`、面板 `327=327`；按钮多行换行 |
| 10 | 记录控制台报错（课程目录数据库错误除外） | **符合** | 仅 8 条课程/讲义 500，无其他 console error、无 pageerror |

## 其他观察与限制

1. **视觉问题（不属于上述 10 项判定）**：当前工作区的 `__root.tsx` 只引入 `styles/globals.css` 与 `styles.css`，未引入 `-home/home.css`、`-home/study.css`；实测 `.home-page` 元素不存在，表单按钮计算样式为 `border:0; padding:0; background:transparent`，即呈无边框纯文本按钮，`.home-actions` 也是 `display:block` 而非预期的 flex 布局。截图 05/10/15 可见按钮缺少外观。本轮期间另一个会话正在持续 HMR 修改 `src/styles/globals.css`、`__root.tsx` 等文件，这更像是样式重构的中间态；本次按“不修改代码”的约束只记录，不修复。
2. **验收环境的并发写入**：本轮期间另一个会话在改代码并 `git add`（我的临时脚本 `probe.py` 也曾被其暂存）。我只删除了自己的临时文件，未对其暂存区做其他改动。
3. **依赖恢复**：为运行测试/服务执行了 `pnpm install --frozen-lockfile`（仅 `node_modules`，未改锁文件）；安装前 `apps/api` 的 Nest 依赖已被并发安装清空。
4. 研招网内部接口无官方文档，以上结果仅代表 2026-10-27 当次响应。

## 最终 git 状态

进程已停止（3001/3002 无监听）。`git status --short`（2026-10-27 18:06 左右）：

```text
A  .scratch/admissions-acceptance.md
M  GLOSSARY.md
 M README.md
 M apps/api/package.json
M  apps/api/src/admissions/admissions.module.ts
A  apps/api/src/admissions/admissions.test.ts
M  apps/api/src/admissions/controller.ts
M  apps/api/src/admissions/service.ts
 M apps/api/src/environment/environment.test.ts
 M apps/api/src/environment/environment.ts
 M apps/api/src/main.ts
A  apps/web/components.json
M  apps/web/package.json
 M apps/web/src/features/admin/admin-page.tsx
A  apps/web/src/features/admissions/api.test.ts
A  apps/web/src/features/admissions/api.ts
A  apps/web/src/features/admissions/index.ts
 M apps/web/src/features/catalog/course-page.tsx
 M apps/web/src/features/catalog/handout-page.tsx
 M apps/web/src/features/catalog/lesson-page.tsx
 M apps/web/src/features/catalog/markdown.tsx
 M apps/web/src/features/catalog/subject-page.tsx
 M apps/web/src/features/catalog/ui.tsx
 M apps/web/src/features/playback/player.tsx
M  apps/web/src/features/profile/draft.test.ts
M  apps/web/src/features/profile/draft.ts
M  apps/web/src/features/profile/index.ts
M  apps/web/src/routes/-home/catalog.tsx
M  apps/web/src/routes/-home/profile-form.tsx
M  apps/web/src/routes/-home/study.css
A  apps/web/src/routes/-home/target-lookup.tsx
M  apps/web/src/routes/-home/workspace.test.tsx
M  apps/web/src/routes/__root.tsx
MM apps/web/src/routes/docs/contract.tsx
M  apps/web/src/routes/index.tsx
MM apps/web/src/routes/login.tsx
MM apps/web/src/styles/globals.css
MM apps/web/tsconfig.json
M  apps/web/vite.config.ts
M  docs/ARCHITECTURE.md
M  docs/delivery/study-workspace.md
M  docs/pitfalls.md
M  docs/specs/0002-personal-study-workspace.md
M  package.json
M  packages/ui/src/styles/globals.css
M  pnpm-lock.yaml
?? .scratch/admissions-browser.md
?? docs/adr/0009-tailwind-shadcn-web-styling.md
```

说明：

- 上述受跟踪文件的改动**全部来自并行会话**（本轮开始时已存在一部分，本轮期间又持续新增，例如 `README.md`、`apps/api/src/main.ts`、`apps/web/src/routes/__root.tsx`、`apps/web/src/styles/globals.css`、`docs/adr/0009-*`）。
- 本次验收只做了读取、运行测试/服务/浏览器、写 `.scratch/admissions-browser.md` 和 `design/` 截图；**没有编辑任何受跟踪文件**。
- `pnpm-lock.yaml` 的 mtime 为 17:36:08，早于本次 17:45 开始的 `pnpm install --frozen-lockfile`，可佐证安装没有改锁文件。
- 上一轮的 `apps/api/src/admissions/live.tmp.test.ts` 已删除且不在索引中；本轮的临时脚本目录 `.scratch/admissions-browser/` 已删除；`design/` 被 `.gitignore` 忽略。
- 并行会话的暂存状态我没有改动（其 `git add` 产生的 index 内容保持原样）。
