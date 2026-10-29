# 16: 备考档案与按天计划

**What to build:** 考生设定初试日期、考试科目、目标分和各阶段的工作日与周末分钟；每天有默认计划，也可以按天调整。

**Blocked by:** 10（进度文件云端读写（网页））

**Status:** ready-for-human（本地完成并做过浏览器实测；真实 API 与线上验收待环境）

- [x] 默认计划推算为纯函数：阶段内按工作日或周末取分配，阶段外不安排；周六、周日按周末
- [x] 阶段不能重叠（校验）
- [x] 按天覆盖存为计划记录
- [x] 没有档案时提示先建立档案
- [x] 数据进入进度文件，往返无损

## Comments

### 2026-10-29：M3 落地

- 新增 `packages/core/src/plan/index.ts`：`getDayPlan`（按天覆盖优先 → 阶段的工作日/周末分配 → 阶段外返回空计划；没有档案且没有覆盖时返回 `null`）、`validatePhases`（结束早于开始、重叠、未按日期先后排列）、`getPlanTotal`、`isWeekend`、`getWeekDays`；`weekdayOf` 放在 `dates` 领域，周六周日按周末、不处理法定调休。
- 新增 `/plan` 页面：初试日期、`otherMin`、科目×目标分、阶段×工作日/周末各科分钟与弹性分钟；保存前用 `studyProfileSchema.parse` + `validatePhases`；按天覆盖写成独立的 `dayPlans` 记录（同日期替换）。保存后 `revision` 变化会重挂表单。
- 今日页与每日记录页在没有档案时显示「先建立备考档案」并链接 `/plan`。
- `otherMin` 是「每天不归入考试科目的固定分钟」，只在今日页提示，不摊进各科分钟。
- 数据落在既有 `progress.data.profile` 与 `dayPlans`；新增 `packages/core/src/progress/round-trip.test.ts` 断言完整进度文件序列化后逐字段往返相等。
- 顺带修复既有 4 个表单（错题/试卷/专题/计划）的科目代码 `pattern="\\d{3}"` 双转义问题：浏览器会把 `\\d{3}` 当成字面正则并阻止提交，改为 `pattern="[0-9]{3}"`。

验证：core plan 17 项、web `/plan` SSR 3 项；浏览器实测在 `/plan` 点击保存后桩 API revision 1→2，控制台无错误。

遗留：真实 API + Postgres 往返未在本机跑（无 Postgres），线上验收待部署。

### 2026-10-29：代码评审修正

- `getDayPlan` 在阶段外改为返回 `null`（不再返回空计划），今日页、每日记录页与 `/plan` 预览都显示「不在任何阶段内」，不再显示 0 分钟计划表。
- 阶段重叠与顺序校验移入 `studyProfileSchema`（`validatePhases` 定义在 `progress/schema.ts`，schema 用 `.superRefine` 拒绝），agent 上传的重叠阶段也会被拒；计划页仍用同一函数给出具体错误文案。
- `/plan` 表单在档案从云端到达或被外部更新时同步；按天覆盖在切换日期时用已有记录回填，不再把旧覆盖当成 0 保存。
- 本轮未重新做浏览器实测。
