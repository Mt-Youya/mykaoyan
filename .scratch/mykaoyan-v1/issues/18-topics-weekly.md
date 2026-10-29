# 18: 考点进度与周复盘

**What to build:** 考生看到所考科目的考点，手动标记未测、学习中、已练；已练的考点根据关联错题自动显示待重测或稳定；每周看到只读汇总并写下周调整。

**Blocked by:** 15（错题与复测）、17（每日记录与今日页）

**Status:** ready-for-human（本地完成并做过浏览器实测；真实 API 与线上验收待环境）

- [x] 考点表作为公共内容，只取考点元数据，不含真题原文与答案
- [x] 考点进度推算为纯函数：已练且有未稳定错题为待重测，全部稳定为稳定，无关联错题保持已练；稳定不能手动设定
- [x] 周复盘从周一开始，汇总各科学习时长对计划分钟、新增错题、新稳定的错题与考点
- [x] 数据进入进度文件，往返无损

## Comments

### 2026-10-29：M3 落地

- 考点表放在 `packages/core/src/topics/data.ts`：`topicSchema` + `publicTopics`，29 条大纲级元数据（302 数学二 M01–M05；408 的 D/C/O/N 四门），只有编号、科目、名称、分组，没有任何真题原文、答案或课程内容。选择静态表而不是新数据库表/API：M3 不新增服务端契约，静态表可在本机完整验证，站主后续直接在数组里增删或细化考点即可。
- `topics/index.ts`：`getTopicState`（手动只到已练；已练且有未稳定错题为待重测；全部稳定为稳定；无关联错题保持已练）、`getTopicStableOn`（取关联错题里最晚的第二次独立完成日期）、`getTopicProgressList`。
- `mistakes/index.ts` 增加 `isMistakeStable` / `getStableOn`，供考点与周复盘按稳定日期归周。
- `weekly/index.ts`：`startOfWeek`（周一开始）、`getWeeklySummary`（各科计划/实际分钟、合计、新增错题、新稳定错题与新稳定考点；非周一抛错）、`upsertWeeklyReview`/`getWeeklyReview`。
- 新增 `/topic-progress` 页面：按档案科目分组，三个手动按钮（未测/学习中/已练）+ 推算状态文案；没有「稳定」按钮。错题表单新增可选「关联考点」，科目变化时清空。
- 新增 `/weekly` 页面：上一周/本周/下一周切换、各科计划对实际、本周变化、下周调整输入；同一周记录替换。
- 数据仍在 `progress.data.progress` / `weekly`；往返无损由 `progress/round-trip.test.ts` 覆盖。

验证：core topics 9 项、weekly 11 项；web 考点页 SSR 3 项、周复盘 SSR 3 项；浏览器实测：考点页显示 M03 稳定与 D02 学习中、点击「已练」后 M01 写入 progress（revision 3→4）；周复盘显示计划/实际与本周变化。

遗留：考点表为站主可维护的首版大纲元数据，未做后台管理界面；真实 API + Postgres 未在本机跑，线上验收待部署。
