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


**2026-10-31 增量**  Codex 的 hallmark finish review 在 gates 输入被截断 293 token 的情况下给出 `ship`，且自述“未检查真实 API 成功态的浏览器呈现”。

- 📎 增量证据: [evidence.gz](./evidence.gz) → VER-01
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


**2026-10-31 增量**  后台 job 报 exit 0 的源头实例：命令写成 `pnpm test > log; echo "exit=$?"`，job 退出码取的是 echo 的 0，实际日志是 `pg_ctl: 无法启动服务器进程` + `[ELIFECYCLE] Test failed`；pnpm 12.15.0 在沙箱里的安装失败也被同一包装掩盖。

- 📎 增量证据: [evidence.gz](./evidence.gz) → VER-02
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


**2026-10-31 增量**  工单验收项被提前勾选 [x]（迁移核对只写了流程、未核对真实 dev/prod），由只读规格审查发现后改回 [ ]。

- 📎 增量证据: [evidence.gz](./evidence.gz) → VER-04
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


**2026-10-31 增量**  浏览器走查把“筛选后列表缩小”写成 `length !== 10`，而 0854 恰好 10 条 → 90s 超时，验收口径本身与数据矛盾。

- 📎 增量证据: [evidence.gz](./evidence.gz) → VER-05
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


**2026-10-31 增量**  交接简报写“静态检查通过”，但变更/决策/验证三节全是“日志中无记录”，实际 44 个架构测试 + 3 个 typecheck 红；审查代理明确“仅静态只读、未跑测试/构建/浏览器”，父会话摘要却未标注该局限。

- 📎 增量证据: [evidence.gz](./evidence.gz) → VER-06
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

### VER-08 · 新增的测试文件被 vitest include 漏收：`pnpm test` 仍报 4 文件 14 测试全绿

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` codex 01a17774-3a23-78d1-b0bc-dfa1c4dd1cae（codex--01a17774-3a23-78d1…md 第 6167–6175、6213–6229、6327–6335 行）

**1. 怎么出现的**
按 TDD 先写测试：新建 `apps/web/src/features/study/profile.test.ts`（import 的 `./profile` 还不存在），同一命令里跑 `pnpm --filter @mykaoyan/web test -- src/features/study/profile.test.ts`。屏幕上先打印 `$ vitest run -- src/features/study/profile.test.ts`，紧跟着的结果却是 `Test Files 4 passed (4)`、`Tests 14 passed (14)`、exit 0——和加文件之前一模一样，新测试根本没出现。

**2. 怎么诊断的**
结果数字没变是第一条线索。agent 先查 `apps/web/vite.config.*`（只有 TanStack Start/Nitro 插件，没有 test 配置），`rg vitest*` 又报 `zsh:1: no matches found`；第二次 `cat apps/web/vitest.config.ts` 才看到 `include: ["src/**/*.test.{tsx,mjs}"]`，`.test.ts` 不在收集范围。

**3. 提了什么方案**
把测试移到 `apps/web/src/features/profile/draft.test.ts`，把 include 扩成 `src/**/*.test.{ts,tsx,mjs}`，再跑全量（采用）；只跑能通过的那个文件绕过（否，等于不写测试）。

**4. 最后怎么处理的**
改完 include 后第一次全量是 `Test Files 1 failed | 4 passed (5)`，新测试第一次真正执行并因缺实现报红；补实现后最终 6 个文件 20 个测试通过。规则：新增测试后先比较 `Test Files` 计数有没有比上一轮多，数字没变就是没跑到，exit 0 不算通过。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-08

### VER-09 · 设计门禁的三层假信号：渲染层根本没跑、dev 浮层被当成页面问题、格式不对的 waiver 静默失效

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` codex 01a17774-3a23-78d1-b0bc-dfa1c4dd1cae（codex--01a17774-3a23-78d1…md 第 5577–5585、5619–5635、5687–5695、5745–5753、5775–5793 行）

**1. 怎么出现的**
首页落地后按 `hallmark` 跑 `sloplint --render`，exit 1。输出里同时有 `WAIVER waive :1 malformed waiver, ignored` 和 `render tier not run: no puppeteer-core found locally, globally or via HALLMARK_PUPPETEER`——豁免注释格式不对等于没生效，渲染层压根没执行，剩下的 FAIL 也分不清是页面问题还是工具问题。

**2. 怎么诊断的**
先把 puppeteer-core 装到仓库外的 `/tmp/mykaoyan-home-lint`，用 `HALLMARK_PUPPETEER` 指过去重跑，对着 vite dev server（4174）得到 3 条 FAIL。逐条核对：`two sticky top:0 elements` 和 `62% of the page's text is still hidden after load` 都来自 TanStack Router devtools 浮层，只有 `.home-subjects label` 的焦点环是真问题。

**3. 提了什么方案**
devtools 包进 `import.meta.env.DEV`；视觉验收改为对 production 构建（4175）跑；waiver 注释补成工具要求的三字段格式（都采用）。

**4. 最后怎么处理的**
production 构建上重跑得到 `sloplint: 0 FAIL, 0 WARN, 6 WAIVED, 2 NOTE`，焦点环也补了。真正消掉假 FAIL 的是换 target 到 production，不是 DEV 那一行改动；看到 `render tier not run` / `malformed waiver, ignored` 要当成“检查没生效”，而不是 0 FAIL。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-09

### VER-10 · 部署成功后的首轮线上探针连报 TypeError / DOMException / curl 28，看着像密钥不一致

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` codex 01a17774-3a23-78d1-b0bc-dfa1c4dd1cae（codex--01a17774-3a23-78d1…md 第 3250–3274、3276–3284、3306–3324、3335–3373、3375–3397 行）

**1. 怎么出现的**
媒体 Worker 部署成功，agent 用本机 `.env` 里的 `MEDIA_SIGNING_KEY` 立刻做只读线上验签：第一次请求返回“线上签名校验未通过；错误类型：TypeError”。接着 DNS 查询正常（`172.67.156.2`、`104.21.72.253`），但 `fetch` 报 `DOMException`，`curl` 报 `(28) Operation timed out after 15001 milliseconds with 0 out of 76 bytes received`，同一行又写着 `HTTP 状态：401`——三个信号互相矛盾。

**2. 怎么诊断的**
没有据首轮结果宣布密钥不一致，而是拆成三层：DNS 是否通、连接是否完成、HTTP 状态是否符合鉴权预期。第一版成对探针（无令牌 / 本机签名 / 篡改签名）得到 `000 / 404 / 401`，被自己的断言 `网络请求尚未完整完成` 拦下，说明 `000` 是连接层失败而不是鉴权失败；随后给 curl 加 `--retry 1 --retry-all-errors --retry-delay 1` 重跑同样的成对断言。

**3. 提了什么方案**
只看首轮 TypeError 判定密钥错误（否，会把网络问题当鉴权问题）；反复手工 curl（否，没有判别力）；成对探针 + 响应头断言 + 传输层重试（采用）。判别点是：有效签名必须 404（对象不存在但鉴权通过）、篡改签名必须 401，且两者都带 `cache-control: private, no-store` 与允许的 CORS 头。

**4. 最后怎么处理的**
重试后 `{check: 本机共享密钥签名, curl_exit: 0, http_status: "404", passed: true}`、`{check: 篡改签名, http_status: "401", passed: true}`，确认本机密钥与 Worker Secret 一致。首轮失败根因未证实（假设是自定义域/边缘刚生效的瞬时连接失败），只宣称探针方法验证通过。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-10

### VER-11 · 「抓取 2026-10-26」的调研结论无法复现：同一 URL 只返回页面标题，仍被写成已核实并进仓库规划

`batch` 2026-10-31 · `severity` medium · `status` hypothesis · `source` dsh session-c2a347c6-6c08-4e52-872c-a9e5dbead756、claude-code b1ac5e6c-2941-46a0-92e3-915f480b1e5b、claude-code d52b9ada-0d96-4c2e-aeca-6308e68166da（dsh--session-c2a347c6-6…md 第 3648–3673、3721–3747、3837–3854 行；claude-code--b1ac5e6c-2941-46a0…md 第 2830–2845 行；claude-code--d52b9ada-0d96-4c2e…md 第 5094–5108、5730–5747 行）

**1. 怎么出现的**
2026-10-26 的只读调研会话里，payments-cn 子调研员用“以上均为官方页面”的口吻报告支付宝当面付与电脑网站支付的额度（“单笔 ≤2000 元、单日 ≤2 万元”“无执照可签约但额度低”），两个来源都标注“页面无更新时间，抓取 2026-10-26”。

**2. 怎么诊断的**
主 agent 08:55 自己 `web_fetch` 同样两个 URL（opendocs.alipay.com/open/00f7nr、00dn7j），两次都只返回标题“小程序文档 - 支付宝文档中心”、HTTP 200 无正文。它没有回头质疑子调研员的“抓取成功”，也没在最终报告里把这两条降级为“未核实”——只给“个人备案网站用于经营性用途”标了未核实。同一天另一个 Claude Code 调研 agent 撞上同一堵墙，写的是“JS 渲染的，没抓到正文，个人能否开通未核实”。

**3. 提了什么方案**
没有替代来源。最终报告选择保留细节、把这两个 URL 当来源；用户把报告原文贴回 CC 会话后，CC agent 只复核了短信相关页面（4990–5052），支付宝这条直接采信。

**4. 最后怎么处理的**
结论写进 `docs/PLAN.md` 的 M5 资质约束并随提交进入仓库；评审时 PLAN `docs/PLAN.md:61` 仍写着“支付宝：电脑网站支付个人账号也能签约，但额度低”。根因未确认（可能来自搜索摘要或模型记忆），本条目按 hypothesis 记录：同一条抓取结果在同一 agent 的另一条路径上不可复现。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-11

### VER-12 · 验收文档写 17 个单测全过，服务却从没启动过：用户第一次打开接口就是 500

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-167c8cf8-953d-49c0-a097-38cab9ebe47c（dsh--session-167c8cf8-9…md 第 18–20、536–560、2144–2146、2259–2261、5243–5252 行）

**1. 怎么出现的**
前一轮交付了 admissions 模块（研招网只读查询），验收记录 `.scratch/admissions-acceptance.md` 写着 `src/admissions/admissions.test.ts (17 tests)` 全过，上游请求次数与间隔都列得清清楚楚；但根 `package.json` 没有一条能启动 API 的命令，服务从未真正跑起来。用户按 README 打开前端 `/api/admissions/units?keyword=郑航`，得到 500——Nitro dev 代理连不上 3001，把连接失败包装成了 HTTP 500。

**2. 怎么诊断的**
agent 先看项目结构与 admissions 代码，再直连上游确认 `autodw.do` 返回 200 `[]`；尝试手动起 API 时撞上 `ERR_MODULE_NOT_FOUND: Cannot find package '@nestjs/common'`，进一步查发现 `node_modules/.pnpm` 正被一个并发 `pnpm install --frozen-lockfile` 重建（`.pnpm` 计数从 0 恢复到 576），属于安装中间态。用户一句话点出根因：“package.json 根本没有 api 的启动命令”。

**3. 提了什么方案**
不再纠缠依赖，先补可复现的启动入口（根脚本 `pnpm serve` → `pnpm --filter @mykaoyan/api dev`），README 写清前后端分别怎么起；验收口径改为“必须真正起服务并 curl 到 200”。

**4. 最后怎么处理的**
`pnpm serve` 起 API 后招生接口 200、返回真实单位数据；后续把“用户实际会用的命令”也加进验证，`pnpm serve`（无库）与端口探测都实测通过。单测只证明模块内部逻辑，不能替代服务启动、代理与端口连通性。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-12

### VER-13 · 架构守卫既误报又误导：`endsWith("")` 把合法跨目录导入全判红，“每包自声明”规则又诱导重复声明

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-167c8cf8-953d-49c0-a097-38cab9ebe47c（dsh--session-167c8cf8-9…md 第 9997–10009、10027–10040、11627–11629、11740–11766、12084–12090 行）

**1. 怎么出现的**
CI 的架构守卫一次报出 12 个跨目录导入失败。agent 读守卫源码发现 `destination.endsWith("")` 恒为真，走进错误分支后把所有跨目录导入判成非法——这是守卫自身的 bug。修掉后仍有 8 个失败，其中“每包必须自行声明 Node 类型/tsx/wrangler”这条规则与 AGENTS.md“全仓工具只在根声明”冲突。

**2. 怎么诊断的**
先把 `endsWith("")` 改成 `.endsWith(".js")`，重跑后失败从 12 降到 8 并逐条查看失败原因；对“重复声明”问题，第一次用户质疑时 agent 去读 `rules.test.mjs:68` 的守卫代码，用规则条款回答“必须自行声明”；用户第二次坚持“`@types/node`、`tsx` 应该是全局的吧？？？”，agent 才承认“照着守卫那条规则机械地加，方向错了”。

**3. 提了什么方案**
A 按守卫规则继续给每个包加 `tsx`/`@types/node`（用户否，且违反 AGENTS.md）；B 根统一提供全仓工具，守卫只在“包特定工具”（wrangler/supabase）时要求自声明（采用）；同时保留真正需要的 `@types/node`、`wrangler` 声明。

**4. 最后怎么处理的**
守卫 bug 修复、重复声明改为根提供 + 守卫调整，后续 CI 门禁最终转绿。守卫测试也是代码，会误报；规则与 AGENTS.md 冲突时先对齐仓库规则，而不是机械满足测试。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-13

### VER-14 · CI 红在 gitleaks「扫到 3 个密钥」，实际是三个 localStorage 键名被 `generic-api-key` 误判

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-167c8cf8-953d-49c0-a097-38cab9ebe47c（dsh--session-167c8cf8-9…md 第 13215–13217、13280–13304、13344–13378、13567–13594 行）

**1. 怎么出现的**
push 后 CI 全绿到 gitleaks 一步变红，扫描全部提交历史报 `leaks found: 3`，CI 日志只给总数、不给文件与行号，看上去像真提交了密钥。

**2. 怎么诊断的**
`gh run view --log` 拿不到明细，于是下载与 CI 相同版本的 gitleaks 二进制，在本地对同一仓库执行 `gitleaks git . --redact --report-format json`，拿到 3 条命中的文件、行号与规则，再打出对应代码行，确认全部是前端 `localStorage` 键名常量（`FAVORITES_STORAGE_KEY` 等），变量名带 `KEY` 且值熵 3.69–3.91，触发 `generic-api-key` 规则。

**3. 提了什么方案**
A 改写这些常量（否，会改变已存数据键）；B 在 `.gitleaks.toml` 里加最小白名单（采用：`extend useDefault` + 只放行三个已知键名正则）；C 关闭 gitleaks（否，会失去真密钥防护）。保留 CI 里“假密钥必须被拒绝”的自检，避免白名单把真密钥也放过。

**4. 最后怎么处理的**
提交 `2e6554e` 修 CI、`9d342a3` 加白名单后推送，CI run success，gitleaks 扫描与假密钥自检都通过。密钥扫描报红时先本地用同版本工具复现命中位置，再判断真伪；不要把“CI 红”直接等同于“泄露”。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-14

### VER-15 · 只读复查把 API 换到 3101，但 Vite devProxy 硬编码 3001：浏览器验证实际打到另一会话的 API 实例

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-fdea89a8-51ca-447d-9de6-5fe250adefb7（dsh--session-fdea89a8-5…md 第 2292–2320、4001–4018、4054–4066、5459–5476 行）

**1. 怎么出现的**
任务要求只读复查研招网目录面板的 4 处修复。开工时 3001 被另一个会话的 tsx 占用、3000 被另一个会话的 vite 占用。按“不改配置”的约束，agent 把自己的 API 起在 3101、前端起在 5173；但 `apps/web/vite.config.ts` 的 nitro devProxy 硬编码 `http://127.0.0.1:3001`，浏览器里的 `/api` 仍然转发到另一个会话的 API 实例。

**2. 怎么诊断的**
CDP 场景跑延迟项时，3001 上的外部 API 在 10:30 左右退出，vite 代理返回 500 `"Dev server is unavailable."` 与 `connect ECONNREFUSED 127.0.0.1:3001`；同时 `curl` 3101 仍 200、3001 为 HTTP 000。agent 把这次失败归因为“另一会话 API 退出”，没有把它当成页面回归。

**3. 提了什么方案**
只读约束下不能改 vite 配置；等 3001 空出后，把自己起的 API 从 3101 改到 3001，使浏览器链路与上一轮一致，再重测延迟项；收尾时停掉本会话的 API/vite 并确认未杀别人的进程。

**4. 最后怎么处理的**
4 项修复与回车回归全部通过，报告写明端口冲突和那次 500 补测，数据取自恢复后的 200 链路。风险仍在：如果复查时没核对代理目标，浏览器里看到的可能是另一会话实例的状态；浏览器验收要记录每个 `/api` 请求的实际 URL 与响应。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-15

### VER-16 · SSR 已渲染的按钮不等于可点击：CDP 第一次点「设置我的备考」因 React 未 hydrate 而超时

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-fdea89a8-51ca-447d-9de6-5fe250adefb7（dsh--session-fdea89a8-5…md 第 2402–2424、2499–2520、2521–2535 行）

**1. 怎么出现的**
agent 用 Chrome CDP 自己写驱动脚本做 UI 复查。第一次运行脚本，点击首页「设置我的备考」后等待下一步按钮「查找学校」，结果 `waitFor timeout`；页面看起来已经渲染出按钮，但点击没有导航或弹层。

**2. 怎么诊断的**
先写 `debug.mjs` 打印按钮坐标与点击后的 URL/正文，确认点击目标存在但状态没变；随后定位到 TanStack Start 的 SSR 先返回 HTML、React 尚未 hydrate，脚本只等 DOM 出现就点了。

**3. 提了什么方案**
在点击前增加 hydration 等待——除了文本匹配按钮，还要求元素上出现 React 内部属性（`Object.keys(el).some(k=>k.startsWith("__react"))`）；之后才执行真实鼠标事件。

**4. 最后怎么处理的**
重跑通过并产出后续测量，这条修复后来复用到多个场景脚本。它只解决“等水合”，没有解决脚本对页面文案（如“北京工业大学”）的硬编码假设，后者在 2534/2585 再次报错。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-16

### VER-17 · 交付报告写「已浏览器实测显示 M0 页面」，实际主域没有任何解析：把控制台配置回读当上线验收

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-1461740f-95ff-42cf-bf42-4e2c42a6d1d1（dsh--session-1461740f-9…md 第 2788–2809、8865–8902、8973–9001 行）

**1. 怎么出现的**
`docs/delivery/m0-local.md` 的 10-27 更新写“前端已按 ADR 0008 发布到独立 `mykaoyan-web` Worker，并绑定 `https://mykaoyan.cn`。控制台读回部署就绪、流量 100%；HTTPS 首页与浏览器均显示当前 M0 Hello 页面”。这份记录随后六天被当成“域名已打通”的事实引用。

**2. 怎么诊断的**
10-29 用户问“能不能先让 mykaoyan.cn 显示出网页”，agent 只读排查：阿里云侧 apex/www/media/api 记录集为空，`dig` 返回 `status: NOERROR, ANSWER: 0`；Cloudflare 侧 zone 已建好，但 NS 一直没交出去。由此反推 10-27 的“浏览器实测”不可能发生。

**3. 提了什么方案**
不改用户正在写的工作区，只提出“这段记录要不要更正，你定”；替代方案是放弃 Worker Custom Domain，前端改部署到广州 ECS（ADR 0012 三选一）。

**4. 最后怎么处理的**
08:19 用户说“先沉淀一下本次会话”，agent 在 `docs/delivery/m0-local.md` 顶部新增状态更新，明确写“更正 2026-10-27 那条记录：‘已绑定并用浏览器实测显示 M0 Hello 页’不成立”，并把根因写进 `docs/ops/current-deployment.md` 与 ADR 0012；三处改动未 commit。域名类验收必须同时给解析侧与服务侧两组证据。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-17

### VER-18 · Nest 12 默认 `abortOnError` 把启动错误吞成 SIGABRT：测试崩了却看不到依赖注入报错

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-93af4232-94a9-4c3e-83f5-d83473bf640f（dsh--session-93af4232-9…md 第 16338–16360、16602–16658、16663–16702 行）

**1. 怎么出现的**
切到省略扩展名 + tsx 运行时后重跑 API 测试，vitest 报三个测试文件 `Worker exited unexpectedly with signal SIGABRT`，14 个文件里 3 个直接崩、89 项只报 70 项通过。

**2. 怎么诊断的**
崩溃堆栈只到 `handleInitializationError` / `initialize`，看不到应用错误；agent 在 `bootstrap.ts` 临时加 `abortOnError: false`，用 vitest 单跑 boot 探针，才拿到真实错误：`Nest can't resolve dependencies of the PlaybackController (PlaybackService, ?) … Symbol(better-auth) at index [1]`。

**3. 提了什么方案**
从编译产物或堆栈猜原因（否，猜不到）；临时关 `abortOnError` 让错误可见并保留成默认装配参数（采用）；`--no-file-parallelism` 单跑（只用于隔离，不解决根因）。

**4. 最后怎么处理的**
给 `PlaybackModule` 补 `imports: [AuthModule, CatalogModule]` 后 boot 探针 1 passed，全量 447 项测试通过。tsc 全程是绿的——类型检查不查 DI 运行时装配。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-18

### VER-19 · 工单验收项写着 `[x]` 但仓库里没有对应接口：只按实现者汇报勾选

`batch` 2026-10-31 · `severity` high · `status` partial · `source` dsh session-93af4232-94a9-4c3e-83f5-d83473bf640f（dsh--session-93af4232-9…md 第 11560–11599、11672–11713、11716–11720 行）

**1. 怎么出现的**
05 的验收项“未登录调用学习数据接口返回 401”被勾了 `[x]`，但全仓没有学习数据接口，`@Controller("progress")` 只出现在测试里，`SessionGuard` 实际只挂在 `/api/admin/*`；07 的播放令牌只读访客 cookie；08 没有任何管理员授予路径。

**2. 怎么诊断的**
提交后按 implement 流程跑 code-review，两个并行子 agent 在 06:08 返回：Spec 轴逐条对照工单与代码定位缺口，Standards 轴另报深导、注释与实现相反等。

**3. 提了什么方案**
假勾选改回 `[ ]` 并注明“接口属工单 10”（采用）；07 补实现 + 测试（采用）；08 的自助授予作为已知缺口写进交付文档；放宽守卫的地方补决定记录（未做）。

**4. 最后怎么处理的**
05/07 修完并有真实 Postgres 测试；08 的授予路径留在 `docs/delivery/m1-local.md`；`rules.test.mjs` 的放宽只出现在审查结论里。验收勾选只按“跑过、能复现”的证据勾。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-19

### VER-20 · 全片渲染卡在 Canvas `addColorStop` 把数字当颜色：Python traceback 掩盖真正的 JS 异常

`batch` 2026-10-31 · `severity` medium · `status` unresolved · `source` claude-code 06ac5a90-d5e5-4074-97af-a64b45ce4421（claude-code--06ac5a90-d5e5-4074…md 第 3240–3268、3269–3282 行）

**1. 怎么出现的**
镜 11–22 的 `chB.js` 写完后跑 20 个时间点的 contact sheet 与 8 个关键时刻的 detail stills；detail stills 直接抛 Python traceback，`--sheet` 汇总图没有产出。traceback 从 `render.py:184` 一路到 `render.py:83 pg.evaluate(f"seek({t})")`，栈里看不到是 canvas 颜色错误。

**2. 怎么诊断的**
第一次展示完整 traceback 只有 Python 自己的调用栈；把命令改成 `... 2>&1 | grep -iE "error|at http"` 后才拿到真正的浏览器侧异常：`addColorStop` 第二个参数拿到数字 `4.55`，位置 `chA.js:314:9`，调用链上溯到 `chA.js:13` 与 `film.js:175`。

**3. 提了什么方案**
没有成型修复方案。方向是 `chA.js:314` 的 `addColorStop` 参数错位（把位置/透明度一类的数字传成颜色），根因未确认。

**4. 最后怎么处理的**
未处理，22 镜成片没有产出，状态停在“代码已写完、渲染未通过”。逐帧渲染脚本被 Python 包一层时，报错要同时保留 `pageerror` 与浏览器栈。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-20

### VER-21 · 新增集成测试没清理自己写的表，既有测试删账号被外键挡住，全量 2 红

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` codex 01a18698-5b8a-7b62-98d5-02f49296be0b（codex--01a18698-5b8a-7b62…md 第 1395–1420、1425–1445、1475–1492 行）

**1. 怎么出现的**
新增 publishing 集成测试写入了 `lesson_publications`，但 afterAll 没清理；同一套件里已有的 admin 测试执行 `delete from accounts` 时被外键 `lesson_publications_account_id_accounts_id_fk` 挡住，全量测试 2 红。

**2. 怎么诊断的**
先看失败位置在外键约束上，再查是谁写入了这张表——新测试的 fixture；确认是测试间的数据残留而不是产品代码问题。

**3. 提了什么方案**
在新增测试的 afterAll 里按创建顺序清理（采用）；放宽外键（否，掩盖数据问题）；测试库每次全量重建（成本高）。

**4. 最后怎么处理的**
补 afterAll 清理后 664 项全绿。共享临时库的测试必须清理自己写入的全部表，否则会污染其他文件。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-21

### VER-22 · 发布功能的失败信号三处失真：删旧对象失败仍报「无需清理」、答案文件不报告、权限不足报 401

`batch` 2026-10-31 · `severity` high · `status` partial · `source` codex 01a186b6-750d-7751-afe7-a3cbd68718fd、codex 01a186b6-4f74-7ac2-afa2-87f7e970c255（codex--01a186b6-750d-7751…md 第 241–255、277–293 行；codex--01a186b6-4f74-7ac2…md 第 259–275、303–309 行）

**1. 怎么出现的**
三处失败信号失真：①删旧 R2 对象失败后，同哈希重发仍报“无需清理”（`cleanupPending` 硬编码 false）；②章根目录的 `答案.md`/`答案/` 静默不报告（工单要求跳过并报告）；③scope 不符/角色撤销返回 401 而不是 403。

**2. 怎么诊断的**
逐项对照 CLI 输出与实现：清理逻辑只看“哈希是否相同”而不看删除结果；答案文件识别只认约定文件名却不进报告；鉴权中间件把权限不足统一映射成 401。

**3. 提了什么方案**
清理结果进入返回值与报告（采用）；答案文件列入 skipped 并报告（采用）；403/401 分开（采用，契约里三个 403 响应说明仍缺）。

**4. 最后怎么处理的**
三处均被并行 main 会话修掉并补测试；接口契约里的 403 说明还没有补。工具的“成功”文案必须由真实操作结果驱动。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-22

### VER-23 · 验收通过时对象正被并发会话改写：走查的是迁移完成前的版本，也没有记录被验收文件哈希

`batch` 2026-10-31 · `severity` high · `status` partial · `source` claude-code aafdb13d-7334-4fd2-ad39-0de7eb348fa4（claude-code--aafdb13d-7334-4fd2…md 第 7861–7923、7931–7939、7945–7961 行）

**1. 怎么出现的**
HTTP 18/18 + 浏览器走查 10 项全部通过，结论写“验收通过”；但同一时段另一个会话正把 `target-lookup.tsx`、`profile-form.tsx` 迁到 Tailwind+shadcn（18:10–18:11 仍在改），走查实际验证的是迁移完成前的版本。

**2. 怎么诊断的**
agent 在报告里明确“这次走查验证的是迁移完成前的版本”，并把迁移后复验列为待办；但它没有记录被验收文件的哈希，无法证明走查与哪一版对应。

**3. 提了什么方案**
验收报告记录被验收文件的 hash/提交号 + 结论只对快照有效（推荐）；等所有会话停下再验收（拖慢）；直接写“通过”（否）。

**4. 最后怎么处理的**
结论按 partial 记录，迁移后复验列为待办。验收要绑定版本，共享工作区里的“通过”必须注明验证的是哪个快照。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-23

### VER-24 · 适配器 41 项测试 + verify 18/18 全绿，但 keyword+省份组合查询永远返回空数组

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-59199c0f-1bea-4527-a0dd-714f0ecb19ff（dsh--session-59199c0f-1…md 第 4050–4068、4074–4111、4368–4391、4588–4601 行）

**1. 怎么出现的**
适配器单测 41 项、`verify` 18/18 对真实上游全绿，看上去可以交付；但 `keyword` + 省份组合的查询永远返回 200 空数组，单字 `keyword` 还会被上游打成 502。

**2. 怎么诊断的**
审计数据流：autocomplete 归一化把省份字段丢成 null，`service.ts` 仍按 `provinceCode` 过滤，于是组合条件永远无结果；单字 keyword 上游 502 则完全没有被错误处理覆盖。

**3. 提了什么方案**
组合条件改 400（字段不完整时拒绝，采用）；补全省份映射（需要上游支持，否）；接受空数组（否，静默错误）。

**4. 最后怎么处理的**
修成 400 后重跑 build/43 项测试/verify 18/18 通过。测试覆盖不到“参数组合”时，全绿只证明已知路径；组合参数要单独构造用例。

- 📎 excerpt: [evidence.gz](./evidence.gz) → VER-24
