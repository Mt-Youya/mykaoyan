# 继承的坑点与规则

从两份旧避坑指南中挑出对本站技术栈仍然适用的条目，改写成规则。编号保留原 ID 并加前缀：`pf/` 指 portfolio 仓库 `docs/avoiding-pitfalls-guide/`，`pg/` 指 postgraduate 仓库 `docs/avoiding-pitfalls-guide/`（两者编号有重复）。原文、证据和处理过程见原仓库，本文件只写规则。

本站自己的新坑点，按同样格式追加在对应主题下，编号用 `mk/<主题>-NN`。

## 1. 验证口径

- **分层报告**（pf/TOOL-05、pg/VER-02、pg/VER-06、pf/TOOL-21）：静态检查、build、dev 启动、浏览器实际打开、真机或用户端效果，各写各的结果，不能用前一层代替后一层。
- **全集计数**（pg/VER-04、pg/VER-07、pg/VER-08、pf/AGENT-20）：先列出全集，再把通过、失败、跳过、缺失分开计数。抽样必须写样本数和没检查的范围。跳过就是跳过，不汇总为通过。
- **断言要能变红**（pg/VER-03、pf/VER-01、pf/VER-03、DB-02 的变异测试）：新守卫或断言写完，故意改坏被测对象确认测试会失败。
- **检查最终交付物**（pg/VER-09、pf/TOOL-22）：校验读最终文件，不读中间常量或已移走的临时路径。
- **否定结论写明范围**（pf/AGENT-01、pg/DATA-06）：写「本次在 X 范围内未查到」，不写「不存在」。
- **退出码不等于成功**（pf/VER-06、pf/TOOL-10）：聚合脚本看逐包输出；管道里用 `${pipestatus[1]}`（zsh）取第一个命令的退出码；`node_modules/.bin` 不存在时命令可能根本没执行。

## 2. 数据库与迁移（Postgres）

- **恢复 schema 默认权限**（mk/DB-01）：`pg_restore --clean` 重建 `public` 后不一定重放其默认 PUBLIC 权限；备份记录源 schema 的 PUBLIC 权限并按原样恢复。恢复前检查专用目标库没有任何非系统对象，不能用清空现有库来绕过冲突。
- **恢复 ACL 的角色依赖**（mk/DB-02）：Supabase 备份的 ACL 会引用 `service_role` 等角色；清单记录非系统角色名，临时恢复库先补齐缺失的无登录、无全局特权占位角色，再恢复 ACL。验证要包含“源角色在目标不存在”的用例。
- **原生 SQL 的时间列是字符串**（mk/DB-03）：`DatabaseService.client` 是 postgres.js 裸连接，`timestamptz` 默认没配 parser，返回 `string` 而不是 `Date`；直接 `.toISOString()` 会 500。映射层同时接受 `Date | string`，或统一在连接层配置 parser 后再依赖 `Date`。

- **迁移从空库重放**（pf/DB-01、pf/DB-04）：CI 每次在临时 Postgres 上从空库跑全部迁移。迁移只执行一次、不重跑；修复要写新迁移，改旧迁移的注释不算修复。
- **授权顺序**（pf/DB-02）：先撤表级权限再按列授权；用 `has_table_privilege`、`has_column_privilege` 写断言。
- **静默 0 行**（pf/DB-03、pf/DB-17）：RLS 或条件不满足时写操作不报错、影响 0 行。写后校验返回行或读回；同一条 CTE 内读到的是旧快照，计数要提交后单独查。
- **函数默认对 PUBLIC 可执行**（pf/DB-05）：每个函数显式 `revoke execute ... from public, anon, authenticated`；用 `pg_proc` 全量列权限矩阵核对。
- **SECURITY DEFINER**（pf/DB-06、pf/DB-08、pf/DB-12）：函数体第一行复查调用者权限；schema 不是安全边界，GRANT 才是；advisor 在迁移之后跑。
- **高权限通道写审计**（pf/DB-07、pf/DB-10）：持有数据库高权限连接的代码路径只有 `apps/api`；审计与变更放在同一事务里。
- **批量操作在服务端筛选**（pf/DB-11）：目标资格由数据库约束拒绝；报告时分开写「预计变化数」和「实际变化数」。
- **远端迁移落后**（pf/DB-16、pf/DEPLOY-27）：部署前用 `supabase migration list` 核对；env 用绝对路径加载，避免空连接串落到本机 socket。
- **SSL 模式**（pf/TOOL-04）：新版 `pg` 把 `sslmode=require` 当成 `verify-full`，显式配置 CA 并写 `verify-full`。
- **导入不覆盖管理态字段**（pf/DATA-03）：CLI `publish` 只写内容字段，不写上架状态、审核状态。
- **引用列必须有写点**（pf/VER-08、pf/VER-14）：权限或查询依赖的每一列都要能找到写入它的代码。

## 3. 认证与会话

- **服务端验签**（pf/AUTH-02、pf/AUTH-08）：每个接口自己从会话或令牌取身份，不信任任何可被伪造的转发头；用户真实 IP 只认 Caddy 设置的头。
- **会话刷新双写**（pf/AUTH-01）：服务端刷新会话后，新的 cookie 必须同时影响本次请求的后续读取和响应；TanStack Start 服务端渲染转发到 NestJS 时，把响应里的 `Set-Cookie` 原样带回浏览器。
- **退出范围显式指定**（pf/AUTH-02）：退出默认只结束当前设备会话，「退出所有设备」单独提供。
- **验证码四层一致**（pf/AUTH-09、pf/AUTH-10、pf/AUTH-17）：验证码位数在短信模板、生成、前端输入框、服务端校验四处一起测；保留上游错误码，不压成一句通用提示；验证码被消费后每个失败分支都能重新获取。
- **回调地址只放存在的域名**（pf/AUTH-03、pf/AUTH-06）：第三方登录的回调地址白名单只写实测 DNS 存在的地址；改完用管理接口读回。
- **账号合并**（pf/AUTH-13、pf/AUTH-15、pf/AUTH-16）：第三方登录方式往往没有邮箱或手机号，账号必须允许先只有登录方式、再绑定手机号；绝不按昵称、邮箱等字段自动合并账号。
- **凭据分用途**（pf/AUTH-11、pf/DEPLOY-09）：管理用令牌和运行时密钥分开命名、分开存放；判断权限用真实资源加阳性对照。

## 4. 媒体与 R2

- **一个主机名只归一个资源**（pf/MEDIA-01、pf/MEDIA-13、pf/DEPLOY-22）：先更新 PLAN §6 的域名归属表再动 DNS；删除自定义域不会回收 DNS 记录；DNS、TLS、HTTP 分三步验证，curl 返回 `000` 表示没拿到 HTTP 状态。
- **R2 的 Range 对象**（pf/MEDIA-02、pf/MEDIA-06、pf/MEDIA-07、pf/VER-10）：`range` 的三个键恒在，按值判断（`Number.isSafeInteger`）；不可满足的区间返回 416 与 `bytes */size`；测试 mock 按真实形状建模并用真实桶校准一次。
- **关掉 Worker 缓存**（pf/MEDIA-03）：媒体 Worker 的 wrangler 配置显式关闭缓存并写注释；媒体响应带 `Cache-Control: private, no-store`。
- **鉴权失败返回 401 且不碰 R2**（pf/MEDIA-04）：校验放在任何 `env.BUCKET.get()` 之前；测试断言拒绝路径从未读 R2。
- **条件请求**（pf/MEDIA-05）：`If-None-Match`、`If-Modified-Since` 不满足返回 304；412 只给 `If-Match`、`If-Unmodified-Since`；`If-Range` 手工实现。
- **跨域字幕**（pf/MEDIA-08、pf/MEDIA-09、pf/DEPLOY-05）：`<video crossOrigin>`，否则跨域 `<track>` 被静默丢弃；`ALLOWED_ORIGINS` 只放精确 origin，测试从 wrangler 配置读取期望值。
- **续签不打断播放**（pf/MEDIA-10、pf/MEDIA-11、pf/MEDIA-21、pf/MEDIA-22）：播放令牌状态按视频 ID 索引；换源前记录 `currentTime`；错误恢复的节流宽于定时续签；续签失败后重新调度。同路由换参数时组件不会重挂载，要显式处理。
- **凭据到期点对齐**（pf/MEDIA-16、pf/MEDIA-17、pf/MEDIA-19、pf/DATA-24）：列出播放令牌、字幕票据等各自的到期点；非法 TTL 拒绝签发，不回退默认值。
- **播放验收**（pf/MEDIA-15、pf/MEDIA-20、pf/VER-23）：小 Range 返回 206 不能证明能持续播放；验收覆盖持续播放、拖动、首字节和吞吐，并从大陆网络实测；`play()` 失败按真实错误类型提示。
- **库与桶一致**（pf/VER-08）：定期核对数据库里的每个对象 key 都在桶里。
- **签名 URL 不是访问控制**（pf/AGENT-06）：它只防盗链，防不住有权限的人传播。

## 5. 部署、配置与密钥

- **签名密钥单一来源**（pf/DEPLOY-25）：HMAC 密钥只在 NestJS 和媒体 Worker 两处，轮换时同时换，并用新签发的令牌实测。
- **Secret 不可回读**（pf/DEPLOY-23、pf/DEPLOY-24）：不凭元数据推断密钥值；需要核对时比哈希。
- **环境变量三态**（pf/DEPLOY-01、pf/DEPLOY-04、pf/DEPLOY-26）：区分未设置、空串、有值；`??` 拦不住空串；构建期内联的 `VITE_*` 与运行时变量不混用。
- **职责拆分**（pf/DATA-04、pf/DEPLOY-03）：不同职责的 Worker 分开部署，一个缺失的密钥不会挡住另一个的发布；新配置先 `wrangler deploy --dry-run` 和 `wrangler types` 验证。
- **工具装进项目**（pf/DEPLOY-02、pf/MEDIA-12）：wrangler、supabase CLI 装成 devDependency，`$schema` 指向真实存在的文件。
- **依赖声明与锁文件**（pf/VER-04、pf/DEPLOY-06、pf/DEPLOY-07、pf/DEPLOY-17、pf/DEPLOY-18、pf/DEPLOY-19）：包特定依赖由各包自己声明，`tsx`、`@types/node` 等全仓库工具只在根声明，并做一次干净安装验证；`devEngines` 写精确版本；install 失败要还原锁文件；聚合脚本覆盖全部包。
- **TypeScript 版本**（pf/DEPLOY-16、pf/TOOL-15）：TypeScript 7 移除了 `baseUrl`，并曾导致构建崩溃。M0 先确认 TanStack Start、NestJS、Drizzle 在所选版本下能构建，不行就钉在能用的版本。
- **生成文件是否入库**（pf/DEPLOY-21）：TanStack Router 的 `routeTree.gen.ts` 等生成物，在 M0 决定是否提交并写进 ARCHITECTURE。
- **调试页不对外**（pf/AGENT-08）：`/setup`、诊断页在生产环境必须登录且为管理员。
- **Worker 名与配置漂移**（mk/DEPLOY-01）：媒体 Worker 线上名是 `mykaoyan`，仓库 `wrangler.jsonc` 一度写成 `mykaoyan-media`；按配置部署会新建一个 Worker，而 `media.mykaoyan.cn` 仍指向旧 Worker。改 name 前先用 Cloudflare API 核对 `workers/scripts` 与 `workers/domains`，确认线上 Worker 名和自定义域绑定，再对齐配置。

## 6. 数据契约与记录

- **组合键**（pg/DATA-01、pg/VER-05）：合并或覆盖时的键要包含来源和内容，不能只按编号；重建前做字段级 diff。
- **证据口径**（pg/DATA-02 至 pg/DATA-07）：站上发布的任何招生、分数类数据都要带学校—学院—专业代码—方向—年份—批次—口径的组合键，保留比较符（「不低于」不能写成「等于」）、发布日期与适用年度。v1 不发布这类数据。
- **工具返回形状**（pf/TOOL-11）：先看真实返回结构再写解析，不猜字段。
- **研招网目录的假空结果**（mk/DATA-01）：`/zsml/rs/*` 匿名只返回前 10 行，第二页是 HTTP 200 加 `{"flag":false,"msg":"请登录"}`；`yjfxs.do` 传与代码不符的专业名称会静默返回空列表；目录没有年度参数。解析时把「请登录」、HTML 页面当失败，用 `totalCount` 标截断，只向上游传代码，年度不符直接拒绝。

- **Rust 契约的整数表示**（mk/DATA-02）：JSON Schema 的 integer 接受 `45.0`、`45e0`，serde 生成整数类型和 Value 等值比较会区分表示。先用原始 schema 校验，仅对类型解析副本与读回比较做安全整数规范化；请求 JSON 不改。typify 纯字符串 anyOf 可能生成结构体，类型层宽化成 String 时必须保留原始 schema 运行时约束。

- **R2 单次 PUT 校验与重放**（mk/MEDIA-01）：不能把 S3 的 FULL_OBJECT SHA-256 支持直接套到 R2；按当前兼容表使用 Content-MD5 与单次 PUT ETag 校验，签入 If-None-Match 防已上传对象被签名重放覆盖。登记前 HEAD；删除失败留计划并重试，不能在同哈希 no-op 时隐藏清理状态。

## 7. Agent 行为

- **单写者**（pf/AGENT-02、pf/AGENT-03、pf/AGENT-09、pg/TOOL-10）：同一工作区同一时间只有一个会话写入；接手前看 `git status`；恢复只回滚自己改的部分。
- **外部动作要授权**（pf/AGENT-15、pf/AGENT-22、pf/AGENT-23、pf/AGENT-10）：commit、push、部署、创建云资源都要本轮明确授权。只读任务不跑会写文件的命令（build 会自动安装依赖、改写生成文件）。看到 `Deploying`、`Uploading` 回显立即停下并说明副作用。
- **范围以最新确认为准**（pf/AGENT-11、pf/AGENT-14、pf/AGENT-24、pf/AGENT-26、pf/AGENT-27）：要扩大范围或指代有歧义时先复述对象和动作再问；不擅自增加交付数量。
- **计划与事实分开写**（pf/AGENT-13、pf/AGENT-19、pf/AGENT-21）：计划中的东西就地标注状态，不写成已实现。
- **异常先做对照**（pf/AGENT-05、pf/AGENT-07、pf/AGENT-18）：没有对照实验的归因标 `UNVERIFIED`。
- **断言前先判断行为对不对**（pf/AGENT-06、pf/AGENT-08）：不要把 bug 写成测试的期望值。
- **完整替换**（pg/AGENT-01、pf/TOOL-14）：替换完整、边界明确的条目，改完读回目标和前后相邻条目；不对公共子串做全局替换。
- **讲解内容的精确性**（pg/AGENT-04、pg/AGENT-09、pg/AGENT-10）：发布的讲稿里，精确公式至少代入一个非 2 的幂和一个边界值验证；「当前方法不适用」和「对象不存在」分开写。
- **别卡在前置检查**（pf/AGENT-25）：读完当前步骤必需的约束就实现一个可验收的小切片。

## 8. 隐私、答案与凭据

- **凭据不进对话和日志**（pf/AGENT-04）：不让用户贴 cookie 或令牌；搜索 env 文件只用 `rg -l` 或比哈希；错误日志不打印完整签名 URL。
- **答案隔离**（pg/AGENT-02、pg/AGENT-03、pg/AGENT-07、pg/VER-04）：题面页、索引、摘要、搜索索引、OG 卡片、sitemap 都不含解法；答案单独存储、单独路由；示例数值与当前题无关；发布前对所有可见载体做答案检出。
- **脱敏三步**（pg/TOOL-01、pg/TOOL-08）：敏感值检查、结构解析、行数核对分别做；脚本没命中不等于已清干净。
- **名单不进站**（pg/VER-07）：考生成绩、名单、私人联系方式不进入站点和仓库。

## 9. 本地工具链（macOS + zsh）

- **cf beta 的 workspace 框架检测**（mk/TOOL-03）：`cf build --mode workers` 在本仓库会将框架命令识别为 `npx vite build` 并拒绝传递 mode。直接用包内 `vite build --mode workers` 生成 Build Output，再用 `cf deploy --prebuilt --mode workers` 检查或发布同一产物；预构建部署不能省略产物记录的 mode。

- **TypeScript 7 工具 API**（mk/TOOL-01）：根入口只提供版本信息；AST 与工程快照改用锁定 SDK 的 `typescript/unstable/ast`、`typescript/unstable/sync`。按安装包声明迁移并重新跑架构守卫，不能沿用 TS5 编译器 API 的验证结论。
- **workspace 工具状态忽略**（mk/TOOL-02）：根 `.gitignore` 中带斜杠的 `supabase/.temp/` 规则不覆盖包内同名目录；使用 `**/supabase/.temp/`、`**/supabase/.branches/`，并用 `git check-ignore` 验证嵌套路径。

- **pnpm 版本固定的沙箱**（mk/TOOL-04）：项目用 `packageManager` 钉死 pnpm 12.15.0 时，本机 pnpm 会尝试把该版本下载到临时目录；沙箱拒绝写入时报 `create the temporary package manager install directory: Operation not permitted`，命令直接失败但被 `| tail` 掩盖成 0。把 `PNPM_HOME` 指到可写目录（如 `/tmp/pnpm-dsh`）即可用钉死版本；不要为此改 `packageManager`。
- **Postgres 启动时的 locale**（mk/TOOL-05）：`initdb`/`pg_ctl` 在 `LANG` 为空的环境里以「postmaster 变成多线程的」失败。测试脚本或 shell 里加 `LC_ALL=C` 再起临时库；`pnpm test` 的内部临时库也受此影响。
- **ESM 循环与注入令牌**（mk/TOOL-06）：领域模块从 `application.ts` 导入注入令牌（`CONFIG`）会构成 `application → domain → application` 的循环；ESM 下该常量处于 TDZ，运行时抛 `Cannot access 'CONFIG' before initialization`，表现为测试进程 SIGABRT。令牌放独立文件（`apps/api/src/config.ts`），`application.ts` 只做转发。
- **vitest 下没有装饰器元数据**（mk/TOOL-07）：tsx/esbuild 不生成 `design:paramtypes`，NestJS 依赖「构造参数类型反射」的注入会失败。构造参数一律显式 `@Inject(TOKEN)`；`useFactory` + `inject` 也可用。tsc 构建能通过，但测试会崩，所以这类改动必须跑一次 API 集成测试。

- **git**（pg/TOOL-02、pg/TOOL-03、pf/AGENT-16、pf/AGENT-17、pf/TOOL-08、pf/TOOL-23、pg/VER-01）：工作区有改动时不直接 pull；`stash -u` 不保存被忽略的文件；不为检查一个文件 stash 整个仓库；提交前看完整的 `git diff --cached --name-only`；连续 `git mv` 不是事务；未跟踪文件要另行比对内容。
- **shell**（pf/TOOL-10、pf/TOOL-19、pg/TOOL-05、pg/TOOL-12、pg/TOOL-13）：macOS 没有 `timeout`；zsh 里 `status`、`path` 是保留变量；`JSON.stringify` 不是 shell 转义；不用会和 URL 冲突的分隔符；`while read` 处理最后一行没有换行符的情况。
- **编码**（pf/AGENT-03、pf/TOOL-06、pf/TOOL-07、pg/TOOL-01）：一律 UTF-8 无 BOM；JSONL 按 `\n` 分记录，不用 `splitlines()`。
- **dev 服务**（pf/TOOL-02、pf/TOOL-05、pf/AGENT-25）：不硬编码端口，确认新实例真的启动而不是撞上旧实例；CSS `@import` 顺序在 dev 与 build 下表现不同。
- **浏览器方法**（pf/TOOL-21）：浏览器原生方法拆出来裸调用会报 `Illegal invocation`。
- **下载完整性**（pg/TOOL-09）：核对 Content-Length 与解析结果。
- **并行子任务**（pg/VER-04、pf/TOOL-20）：汇总时逐份核对长度与结尾；不要把子任务的完整记录回灌进主会话。

- **测试文件收集范围**（mk/TOOL-08）：前端 Vitest 曾只包含 `.test.tsx` 与 `.test.mjs`，新增 `.test.ts` 会被静默跳过。增加测试后先核对实际收集数量与失败用例，再把通过作为验收证据。
- **并行测试文件共享手机号限流**（mk/TOOL-09）：API 的 Vitest 文件并行跑、共用一个临时库；不同文件用同一个手机号走验证码登录会触发 60 秒冷却，表现为随机 429。新增登录测试一律用全仓库唯一的测试号，冲突时按文件核对 `grep` 结果而不是重跑碰运气。

- **Windows 检出的行尾与技能链接**（mk/TOOL-10）：`core.autocrlf=true` 时 Git 检出为 CRLF，而 `.oxfmtrc.json` 要求 LF，第一次 `pnpm fmt:check` 会在几十个既有文件上报错；先跑 `pnpm fmt` 归一，提交内容不变。`postinstall` 会把 `.agents/skills/mykaoyan`、`.claude/skills/mykaoyan` 换成 junction，而 git 以 symlink 记录（`core.symlinks=false`），此时 `git status` 会显示删除，`git add -A` 还会把链接内容当成新文件加入；提交只 `git add` 具体文件，收尾用 `git checkout -- .agents/skills/mykaoyan .claude/skills/mykaoyan` 恢复占位文件。

## 不再适用的条目

| 条目 | 原因 |
| --- | --- |
| pf/AUTH-02③、pf/VER-17、pf/DEPLOY-04 的 `proxy.ts` 部分 | Next 16 的文件约定 |
| pf/AUTH-01 的 `NextResponse` 写法 | Next 专有 API，原理已并入 §3 |
| pf/AUTH-04、pf/AUTH-05、pf/AUTH-07、pf/AUTH-12、pf/AUTH-14 | Supabase Auth 发信、模板、cookie 格式，Cloudflare Access 会话；本站不用 Supabase Auth 和邮箱登录 |
| pf/DB-09 | 旧 PGlite 验证脚本 |
| pf/DB-13、pf/DB-14、pf/DB-15 的 Supabase Storage 部分 | 本站不用 Supabase Storage；「先传新对象、再写库、再删旧」已并入 PLAN §5.3 |
| pf/DEPLOY-01 的 Vercel 部分、pf/DEPLOY-10、11、14、15、21、23、24 的 Vercel 与 Next 部分 | Vercel、Next 专有；原则已并入 §5 |
| pf/DATA-07、pf/DATA-12、pf/DATA-23、pf/DATA-29 | Next 生成物、RSC 边界、Vercel Analytics、Upstash |
| pf/DEPLOY-08、09、12、13，pf/TOOL-03、12、16、17，pf/TOOL-18 | 本机代理、凭据管理器、MCP 配置、受限浏览器、会话考古工具、打印纸型 |
| pg/AGENT-05、06、08、11，pg/TOOL-06、07、11 | 个人备考辅导与视频制作流程 |
