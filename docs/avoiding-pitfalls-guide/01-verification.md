# 1 · 验证与验收口径

> 交付时说“通过了”，不等于真的验证过；这一章收的是 dry-run 全绿、job 状态、typecheck 声明与测试夹具自己出错这几类假信号。

### VER-01 · dry-run 全绿只证明契约合法，不证明内容正确

`batch` 2026-10-31 · `severity` high · `status` partial · `source` dsh 887627e1-5f5d-474a-8d9c-994f169faadc（dsh--887627e1…md 第 5231–5277、5333–5396、5438–5461 行）

**1. 怎么出现的**
数学二真题转换完成，CLI `publish-paper --dry-run` 20 套全部 PASS（exit 0），交付报告写“20/20 通过”。随后 agent 自己写的逐题内容比对脚本报 `PROBLEMS: 67`；修完切块逻辑仍剩 15 处 `mismatch src=N gen=N+1`，没有清零就交付，交付报告里没有出现这 15 处。

**2. 怎么诊断的**
先跑 CLI dry-run——它只校验 zod 契约、题号升序、选项规则，不看内容；另写脚本把源题面按 `**N.**` 切块，去掉图片引用与选项前缀，压平后与 JSON 的 `stemMarkdown+options` 比对，同时检查 `answerMarkdown/analysisMarkdown` 能否在答案文件里逐字找到——第一轮 67 处失败。调整切块逻辑后降到 15 处，全是生成侧多 1 个字符（占位 `>` 残留），没有再解释。

**3. 提了什么方案**
采用“契约校验 → 逐题源文比对 → 字段级断言”三层；明确拒绝只信 dry-run；人工逐题 24 题×20 套时间不允许。代价是比对脚本自己也会错：占位符在 `sourceNote` 里被重复计数，一度产生 11 条假阳性。

**4. 最后怎么处理的**
dry-run 20/20 的证据只能证明结构合法；15 处内容差异没有进入交付报告。“dry-run 通过”是一种局部验证，必须和内容比对分层写在报告里。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-01

### VER-02 · 后台 job 报 completed / exit 0，可能正是失败现场

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh 7a61d060-c547-4b14-8cf4-d637aaa30195（dsh--7a61d060…md 第 10030–10100、10160–10218、10942–10971 行）

**1. 怎么出现的**
同一次全量测试里，日志明确写着 `EXIT CODE: 1`、`× "pnpm recursive run" failed in packages/db`、`[ELIFECYCLE] Command failed with exit code 1.`，工具却把这次后台 job 报成 `[status: completed, exit code: 0]`，用户消息也照抄了“completed, exit code 0”。如果只看 job 状态，4 个红测试就是“全绿”。

**2. 怎么诊断的**
脚本形如 `pnpm run test:packages; $code=$LASTEXITCODE; Write-Host "EXIT CODE: $code"`——最后一条命令是成功的 `Write-Host`，pwsh 进程退出码因此是 0。agent 后来把结果落盘到日志，再 grep `Test Files/FAIL` 复核，并在新命令里先存 `$LASTEXITCODE` 再打印。

**3. 提了什么方案**
①脚本末尾 `exit $code`；②只信日志不信 job status；③日志落盘 + `$code` 显式打印 + 测试计数复核（采用）。`exit $code` 最稳，但 `finally`/清理分支容易把它吞掉，所以本批用 ③ 兜底。

**4. 最后怎么处理的**
同一会话后续得到 `lint exit=0 / typecheck exit=0`，与日志 `Found 211 warnings and 0 errors.` 一致；失败轮保留 `EXIT CODE: 1` 作为反证。后台 job 的 `[status]` 是包装器状态，不是被测命令的退出码。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-02

### VER-03 · 集成测试自建 Nest 应用，合法 1 MB 请求被默认 100 kB 上限打成 500

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh 90b5dc58-9060-41b1-9584-c25a2c8e08f2（dsh--90b5dc58…md 第 9418–9474、9672–9734 行）

**1. 怎么出现的**
投稿手稿集成测试断言 `expected 500 to be 400`，失败在 `materials.test.ts:226`。手稿正文接近 1 MiB，按契约应返回 400（正文超限）或 200，实际是 500。

**2. 怎么诊断的**
对照生产装配：`bootstrap.ts` 用 `NestFactory.create(..., { bodyParser: false })` 加 `useBodyParser("json", { limit: "2mb" })`（`mk/API-01` 的既有修复）。测试的 `start()` 却用 `module.createNestApplication({ logger:false })` 后直接 `listen`，既没关默认 body parser，也没有 2 MB 上限；`express.json()` 100 kB 限制在校验前就拒绝，`ProblemFilter` 把非 `HttpException` 映射成 500。

**3. 提了什么方案**
让测试 app 的装配参数与 `createApp` 保持一致（采用，并在注释里写明原因）；直接调用 `createApp()`（测试需要 `overrideProvider`，本批做不到）；改接口分块（突破契约，否）。

**4. 最后怎么处理的**
对齐后 `materials.test.ts` 5/5 通过，submissions 4 个文件 17 项全过。测试环境与生产装配不一致时，状态码会先骗过你。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-03

### VER-04 · 「待 Lead 跑」不是验证：迁移重放拖到四小时后，第一次就 4 项红

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh 6d56461f-a76c-4d68-a5c8-f585666ec968、dsh 7a61d060-c547-4b14-8cf4-d637aaa30195（dsh--6d56461f…md 第 7560–7587 行；dsh--7a61d060…md 第 10037–10105 行）

**1. 怎么出现的**
数据库/契约会话交付时写“迁移重放与数据库约束测试因本机无 psql/Postgres 未运行……待 Lead 在临时库跑”，然后就把任务标了 complete。四小时后另一个会话首次真正重放：`Test Files 1 failed (1)`、`Tests 4 failed | 12 skipped (16)`——其中一项是 psql 中文编码环境问题，另几项是中文 INSERT。

**2. 怎么诊断的**
启动时本机确实没有 psql；该会话只做了 typecheck/build、`drizzle generate` 幂等；另一会话先用 Lead 的临时库只跑了 comments/submissions，没有跑 db 迁移测试；真正首次全量重放发生在四小时后，先 4 红，修编码后 16/16。

**3. 提了什么方案**
交付前必须空库重放一次并留输出（最终路径）；只交付未验证测试但显式标注（本批采用，代价是 complete 语义含糊）；把动态迁移测试设为 CI 前置（没做）。

**4. 最后怎么处理的**
最终 16/16 通过，但验证发生在另一个会话、四小时后。写完了断言 ≠ 断言跑过；无法本机重放时，任务完成状态要带“未验证 + 谁在什么环境补跑”。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-04

### VER-05 · 测试夹具和断言自己会错：写死字节数、把合法输入当非法用例

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27、dsh c7c56444-856a-40c3-9b85-3d33259f4f37、dsh 90b5dc58-9060-41b1-9584-c25a2c8e08f2（第 16730–16790 行；第 8142–8162 行；第 7528–7580 行）

**1. 怎么出现的**
三处：CLI 测试把 dry-run 输出的 Markdown 字节数写死成 45，实得 52；用户试卷集成测试期望“非选择题带选项”返回 400，实际 201；前端单测用中文提示文案的子串断言，文案一改就红（如期望 `最多2条`，实现写 `最多添加2条字幕`）。

**2. 怎么诊断的**
字节数改为用同一份样本字符串长度计算；400 用例的问题是在 Lead 临时库实跑时暴露的——`extraOptions` 浅拷贝了 `type:"简答", options:null` 的合法题，服务端返回 201 才是对的，Lead 给简答补非空 options 后 8/8；文案断言改到实现文案或结构化字段。

**3. 提了什么方案**
断言由同一输入计算；非法用例从零构造，并配一个合法变体作对照；文案断言集中到常量/快照（采用）。“断言要能变红”只对了一半——也要证明它不会乱红。

**4. 最后怎么处理的**
cargo test 5/6/2 组通过、user-papers 8/8、两个前端会话最终全绿。测试通过前，要先确认夹具是合法的、断言对应的是行为而不是措辞。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-05

### VER-06 · 验收表写着 typecheck 全仓通过，HEAD 实际编译失败；静态审查不跑守卫

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh ffd215ee-8cd2-4bf2-b2a5-90b0ec5b0712、dsh 3e0e5455-7b1b-405b-a3ca-1de52da66a95（第 7131–7176 行；第 6319–6352 行）

**1. 怎么出现的**
工单验收表里有一行 `pnpm typecheck | 全仓通过`。审查者没有照抄，重跑全仓 `pnpm typecheck` 得到 `apps/web typecheck: src/features/daily/daily-page.tsx(208,13): error TS2322: Type '(log) => void' is not assignable to type '(...) => Promise<boolean>'`，apps/web 失败退出。同一批另一个只读审查子代理只看源码就判断 `import type { Topic } from "../topics/data"` 会让架构守卫判红，但没有运行守卫。

**2. 怎么诊断的**
用 `git show c782dab:apps/web/src/features/daily/daily-page.tsx` 复核提交内容，确认 HEAD 就是返回 void 的版本；而审查运行期间同一工作区的文件已被父会话改成 async 版本——同一文件先后出现两种内容，靠“行号以 HEAD 为准”兜底。后续提交 `edd713f` 重写保存路径。

**3. 提了什么方案**
交付前逐项重跑 `fmt/lint/typecheck/test/build` 并保留原始输出（采用）；信任工单验收表（否）；只跑改动包的 test、不跑 typecheck（否，测试绿但类型不成立）。架构守卫那条：静态阅读 + 规则源码 + 导入实文三方一致即可定性，但结论应标注“未运行守卫”。

**4. 最后怎么处理的**
修复提交同时消除了类型错误与深层导入；下一条提交也验证了守卫判断。历史验收表不是证据，只能当线索。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-06

### VER-07 · 汇报里的汇总数字也要按全集计数：11 套含图写成 12 套

`batch` 2026-10-31 · `severity` medium · `status` partial · `source` dsh 887627e1-5f5d-474a-8d9c-994f169faadc（dsh--887627e1…md 第 5287–5306、5799–5806 行）

**1. 怎么出现的**
数学二 20 套转换完成后，汇报与给用户的最终回复写“含图 12 套、19 处”。实际逐套 JSON 的 `imgs` 统计非零只有 **11 套**、19 处——处数对，套数多报 1 套。

**2. 怎么诊断的**
验收脚本按套输出 `imgs: N`，人工汇总时把“19 处”平均摊到 12 套；核对 20 份 JSON 与发布列表后确认 11 套含图。这类错误不影响数据，只影响对用户的结论。

**3. 提了什么方案**
汇报前先跑一段按全集重算汇总的脚本，把“套数/处数/题号”都直接从 JSON 聚合出来（采用）；只写“多套含图”模糊表述（不满足用户要精确数的需求）。

**4. 最后怎么处理的**
数据未改；错误停留在文字报告里，没有被发现后更正。凡是汇报里的数字，都应能被一条命令重算出来。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-07
