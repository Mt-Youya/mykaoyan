# 8 · 本地环境与沙箱

> 这台 macOS 机器的沙箱、pnpm、formatter 与语言服务器，替 agent 制造了另一批“假失败/假成功”；这一章收的是环境边界本身。

### ENV-01 · pnpm 12 的 Agent Skills 联动：批准了依赖自带 skills 却未声明 `skills.dirs`，整个 install 被中止

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-b902bd3c-c40b-4d8f-ab7a-dfc5b4bd44dc（dsh--session-b902bd3c-c…md 第 18–33、617–712、866–905、1409–1417、1633–1655、3609–3644 行）

**1. 怎么出现的**
用户执行 `pnpm up -rL`，依赖其实已经 `Already up to date`，但安装收尾报 `Error: ERR_PNPM_NO_AGENT_SKILLS_DIR`、`× updating dependencies`，退出非 0。原因是 `pnpm-workspace.yaml` 用 `permissions: '@tanstack/react-router': { skills: true }` 批准了依赖自带的 skills，而工作区没有任何 `skills.dirs`。

**2. 怎么诊断的**
先看 `pnpm help` 没有 `skills` 子命令；又去 `~/.pnpm/.../@pnpm/exe/pnpm` 这个 39 MB Mach-O 里 `strings` 搜 `AGENT_SKILLS`，结果 0；再 web_search 到 pnpm PR 与 Agent Skills 文档才确认这是 v12.11.0 新增能力。中途还有一次 `timeout 20 pnpm install --help` 在 macOS 上报 `bash: timeout: command not found`。

**3. 提了什么方案**
按文档在 `pnpm-workspace.yaml` 加 `skills.dirs`，先只指向 `.claude/skills`（仓库本来有），验证后为 DSH 再补 `.agents/skills`；报告里另给“只留一个目录”和 `skills.dirs: []` 两个退路。

**4. 最后怎么处理的**
两次 edit 后 `pnpm up -rL` 与 `pnpm install --frozen-lockfile` 均 `EXIT=0`，两个目录各生成 2 个软链。依赖管理器升级后 install 失败先读错误自带的 `help:` 行。

- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-01

### ENV-02 · 沙箱三处硬限制被当成代码失败：写不了 `~/.codex`、监听不了 127.0.0.1、连不上研招网

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` claude-code be2ff72c-f9e2-4e56-986e-c609d82498f3（claude-code--be2ff72c-f9e2-4e56…md 第 728–745、746–825 行）

**1. 怎么出现的**
Claude Code 会话里三件事同时失败：写 `~/.codex` 下的交接文件被拒、起本地服务监听 `127.0.0.1` 报 `listen EPERM`（一次全量 14 failed）、抓研招网报 `deny network-outbound`。三处都被初判成“任务/代码失败”，agent 继续改代码。

**2. 怎么诊断的**
同一个失败在三处出现后，agent 开始核对环境：Claude Code 的沙箱把可写目录限制在工作区、禁用本地监听、按白名单放行网络；改到用户终端/或换到可写路径后，同一操作成功（外包验收跑出 17/17）。

**3. 提了什么方案**
改 `~/.claude/settings.json` 放宽沙箱（需要用户操作、且旧会话不重载）；把需要网络/监听的步骤交给用户终端；或者在允许的路径重建工作产物（采用组合）。

**4. 最后怎么处理的**
三处失败最终都被归因到沙箱边界而不是代码，交接交给 Codex 继续。看到 `EPERM`/`deny network-outbound` 先查环境边界，别急着改业务代码。

- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-02

### ENV-03 · macOS 沙箱跑 Playwright：Chromium 要 `--single-process --no-zygote`，本地 HTTP 服务改 route 拦截

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` claude-code 06ac5a90-d5e5-4074-97af-a64b45ce4421（claude-code--06ac5a90-d5e5-4074…md 第 255–313、334–343、345–370、2452–2484 行）

**1. 怎么出现的**
`check_environment.py` 报唯一红项“浏览器不可用”。不是没装 Chromium，而是启动时 Mach port 服务被沙箱拒绝：`bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer…: Permission denied (1100)`；回退本机 Chrome 又因 Crashpad/profile 写权限 `Operation not permitted`。

**2. 怎么诊断的**
没有反复重装 playwright，而是手工用 `sync_playwright` 加 `--single-process --no-zygote` 试起，得到 `OK hi`；再回看 `engine/render.py` 的 `launch_browser()`，确认默认没传这两个参数。修好浏览器后紧接着撞上第二道：渲染脚本自带 `http.server` 要 bind 本地端口，沙箱拒绝，栈顶 `PermissionError: [Errno 1] Operation not permitted`。

**3. 提了什么方案**
浏览器侧用 `--single-process --no-zygote`；服务器侧不申请更宽网络权限，而是把本地副本 `tools/render.py` 的 `serve()` 换成 Playwright `page.route("http://vk.local/**", _route)` 直接从磁盘 `fulfill`，保留空 `_NoSrv` 占位。

**4. 最后怎么处理的**
`--stills` 成功输出 4 张，全片渲染继续；两次绕过都在会话里留下可用代码，但没有验证 `--motion`/`--video` 等其他子命令。受限沙箱里先跑最小 launch 探针再动工具。

- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-03

### ENV-04 · 沙箱网络白名单是“会话语义”：`allowed_domains` 扩不宽，云 API 只能改走用户终端

`batch` 2026-10-31 · `severity` high · `status` partial · `source` claude-code 06ac5a90-d5e5-4074-97af-a64b45ce4421、claude-code aafdb13d-7334-4fd2-ad39-0de7eb348fa4（claude-code--06ac5a90-d5e5-4074…md 第 2711–2713、2950–2976、3107–3132、3134–3147 行；claude-code--aafdb13d-7334-4fd2…md 第 4318–4329、5641–5644、5774–5791、6783–6823 行）

**1. 怎么出现的**
用户要求用 MiniMax 人声，agent 写好 `tools/narrate.py` 后在沙箱 Bash 里合成，连续 3 次 `403 user denied`；`<sandbox_violations>` 明确写 `deny network-outbound api.minimaxi.com:443 (user denied)`。

**2. 怎么诊断的**
第一次带 `"allowed_domains":["api.minimaxi.com","api.minimax.io"]` 被工具直接拒绝——“`allowed_domains` cannot widen network access in this session”。真正的线索来自另一仓库的本地笔记：10-17 已踩过同一问题，结论是“沙箱内被网络白名单拦截，需在用户终端运行；旧会话不重新加载白名单，要开新会话”。

**3. 提了什么方案**
①继续在沙箱重试（否，3 次相同 403）；②改 `~/.claude/settings.json` 期望即时生效（否，旧会话不重载）；③用终端工具在用户本机终端跑同一脚本（采用）。

**4. 最后怎么处理的**
终端 tab 启动成功，agent 一边等合成一边继续写下一镜；会话结束前没有验证 22 段旁白是否全部合成、时长是否满足上限。需要网络白名单的服务，先在本地笔记里查“沙箱能不能连”。


**2026-10-31 增量**  运行中改 `.claude/settings.local.json`（`allowedDomains`/`allowLocalBinding`）不生效：旧会话不重载，`listen EPERM` 让 14 个 HTTP 集成测试全挂、真实上游仍 `deny network-outbound`。

- 📎 增量证据: [evidence.gz](./evidence.gz) → ENV-04
- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-04

### ENV-05 · pnpm 钉死版本在受限沙箱跑不了 `pnpm exec`，又被并发会话改成不存在的 12.15.1

`batch` 2026-10-31 · `severity` high · `status` partial · `source` dsh session-5b907d70-32e9-490d-a045-b856310860d7、dsh session-d4b12f2c-71ba-4bbe-adc4-1b6875d980ba、claude-code aafdb13d-7334-4fd2-ad39-0de7eb348fa4（dsh--session-5b907d70-3…md 第 1443–1507 行；dsh--session-d4b12f2c-7…md 第 2432–2460 行；claude-code--aafdb13d-7334-4fd2…md 第 6849–6887、7027–7052、7076–7093、7105–7119、7700–7743 行）

**1. 怎么出现的**
`packageManager` 钉死 `pnpm@12.15.0`，在受限沙箱里 `pnpm exec` 报 `create the temporary package manager install directory` / `Operation not permitted (os error 1)`；同一天另一边，并发会话把根 `package.json` 的钉死版本改成公共源上不存在的 `12.15.1`（404），整仓 `pnpm exec` 全部起不来。

**2. 怎么诊断的**
一边定位到 pnpm 需要在可写目录解包固定版本，指向只读 HOME 就失败；另一边用 `pnpm up -rL`/`pnpm install` 的输出确认版本不存在，再读 `package.json` 发现是外部改动。

**3. 提了什么方案**
沙箱侧用 `node_modules/.bin` 直接调用二进制，或把 `PNPM_HOME` 指到可写目录；版本侧恢复 `12.15.0`（用户授权后 restore），并发会话则等它停写。

**4. 最后怎么处理的**
两个会话最后都绕过了 `pnpm exec`；版本在用户授权后恢复。版本号是共享工作区的易失状态，执行前先读 `package.json` 并确认能装到。

- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-05

### ENV-06 · 把 oxlint `--fix` 当成能改箭头函数：内置 `func-style` 没有 fixer，只能写本地插件

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-bfb9c957-ad76-4f06-b06b-3dc5ed2762b7（dsh--session-bfb9c957-a…md 第 4500–4515、8638–8673、9495–9541 行）

**1. 怎么出现的**
要批量把模块级函数改成箭头函数，agent 以为 `oxlint --fix` 能改，跑了 `--fix`、`--fix-suggestions`、`--fix-dangerously` 三种模式都不改；规则表里 `func-style` 的 Fixable 列是 🚧。

**2. 怎么诊断的**
三种 fix 模式实测同一结果后，agent 去查规则文档，确认内置规则没提供 fixer，只能自己写本地 JS 插件补 fixer；首版 fixer 还丢了 `React.FC<Props>` 注解，触发 no-unused-vars。

**3. 提了什么方案**
继续找内置修复（否）；写本地 oxlint JS 插件实现 fixer（采用）；手工改 200 处（否，易错）。

**4. 最后怎么处理的**
插件把泛型搬到参数位置后 lint 全绿。自动修复能力取决于规则是否带 fixer，先查 Fixable 列再决定写不写插件。

- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-06

### ENV-07 · 在多个会话共享的脏工作区里首次启用 formatter：`--check` 一次报 327 个文件、别人已 staged 58 个

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-bfb9c957-ad76-4f06-b06b-3dc5ed2762b7（dsh--session-bfb9c957-a…md 第 6431–6448、8978–9032 行）

**1. 怎么出现的**
仓库第一次接入 oxfmt，`oxfmt --check` 一次列出 327 个文件要重排；同一时刻另一个会话已 staged 58 个文件（路由分组重构）。全仓 `--write` 会把别人的暂存内容一起写。

**2. 怎么诊断的**
先看 `--check` 的文件清单与 `git status`，确认待格式化范围横跨多个在途改动；再判断“全仓写”与单写者规则冲突。

**3. 提了什么方案**
直接全仓 `--write`（否，会改写别人 staged 文件）；只格式化自己负责的目录并用显式 pathspec 提交（采用）；等所有会话停下再统一格式化（拖慢但不切实际）。

**4. 最后怎么处理的**
formatter 配置与首个目录的格式化分开提交，`--check` 逐步收敛。首次启用格式化工具要按目录分批，不要在全仓脏工作区里跑 `--write`。

- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-07

### ENV-08 · 新生成物没进 formatter 忽略清单：`pnpm fmt` 把 schema 压成单行，与生成器输出冲突

`batch` 2026-10-31 · `severity` high · `status` unresolved · `source` dsh session-58c9d8ef-5a44-4843-9be2-08375a44153f（dsh--session-58c9d8ef-5…md 第 1727–1749、1828–1855、1950–2004、2010–2046、6321–6340 行）

**1. 怎么出现的**
`skills/mykaoyan/references/progress.schema.json` 由生成器写出多行 JSON，`pnpm fmt` 把它压成单行；CI 的“重新生成后无差异”检查必然红，因为生成器又会写回多行。

**2. 怎么诊断的**
先看 `pnpm fmt:check` 的红项，再对比生成器输出与 formatter 输出，确认是 formatter 改了生成物；定位到 `.oxfmtrc.json` 的 `ignorePatterns` 没有这条路径。

**3. 提了什么方案**
把生成物加进 ignorePatterns（推荐，采用为修法）；让生成器输出格式化后的形态（脆弱）；每次生成后跑 fmt 并提交（污染生成器语义，否）。

**4. 最后怎么处理的**
根因与修法写清楚了，但在换任务前没有实际修改，`pnpm fmt:check` 仍红在生成物上——这是仍未关闭的坑。生成物与被格式化文件必须互斥。

- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-08

### ENV-09 · 编辑器/语言服务器报错骗人：rust-analyzer 把 std prelude 宏全判 unresolved，空工程可复现

`batch` 2026-10-31 · `severity` medium · `status` hypothesis · `source` dsh session-3abaac33-43bc-48d6-b2d9-d6fc3ee71290（dsh--session-3abaac33-4…md 第 6490–6492、6515–6524、6790–6825、6897–6910、6995–7018、7052–7107 行）

**1. 怎么出现的**
编辑器报 `scan.rs` 有错，std prelude 的宏全部 unresolved。agent 先按真实编译错误排查，改代码无效果。

**2. 怎么诊断的**
建一个空工程用同一 rust-analyzer 复现，报同样的 unresolved；再跑 `cargo check`/`clippy`/`test`，全部通过——说明是语言服务器版本与工具链错配，不是仓库代码问题。

**3. 提了什么方案**
按编辑器报错改代码（否，会引入无意义改动）；在空工程对照 + 命令行校验后忽略该报错（采用）；升级/降级 rust-analyzer（根因确认但未执行）。

**4. 最后怎么处理的**
结论是“编辑器报错 ≠ 编译错误”，按 hypothesis 记录，修复未执行。编辑器红波浪线要先用命令行编译器复核。

- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-09

### ENV-10 · 没实测就断定「写注释必须用 `.jsonc`」：改名后实测 schema 允许注释又改回 `.json`

`batch` 2026-10-31 · `severity` low · `status` resolved · `source` dsh session-bfb9c957-ad76-4f06-b06b-3dc5ed2762b7（dsh--session-bfb9c957-a…md 第 9537–9554、9942–9963、10019–10036 行）

**1. 怎么出现的**
要给 `.oxfmtrc.json` 写注释，agent 断定“JSON 不允许注释、必须改用 `.jsonc`”，先建了 `.oxfmtrc.jsonc` 并改名。

**2. 怎么诊断的**
用户一句“为什么 `.oxlintrc.json` 就不用（改）”后，agent 实测两个 schema 都 `allowComments: true`，原来的 `.json` 就能写注释。

**3. 提了什么方案**
改名成 `.jsonc`（第一版，错）；实测后改回 `.json`（采用）；两个配置混用两种后缀（否，增加认知负担）。

**4. 最后怎么处理的**
改回 `.json` 并单独提交。工具链对注释的支持要看实际 schema/解析器，不能凭文件后缀猜。

- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-10

### ENV-11 · 本机 skill 校验器缺依赖且不认规范字段：`ModuleNotFoundError` + `Unexpected key`

`batch` 2026-10-31 · `severity` low · `status` resolved · `source` codex 01a18698-5b8a-7b62-98d5-02f49296be0b（codex--01a18698-5b8a-7b62…md 第 349–400、369–396 行）

**1. 怎么出现的**
用本机 skill-creator 校验器校验 SKILL.md，先报 `ModuleNotFoundError: No module named 'yaml'`（缺 pyyaml），补上后又报 `Unexpected key(s): compatibility`——规范里有、本机校验器不认识。

**2. 怎么诊断的**
对照校验器源码确认它支持的字段集合停在上一个版本；`compatibility` 是 agentskills.io 规范后加的字段。

**3. 提了什么方案**
给本机装 pyyaml（采用）；删掉 `compatibility` 字段、把它压进正文（采用）；改校验器源码（越界，否）。

**4. 最后怎么处理的**
删字段改正文后 `Skill is valid!`。本机校验器是旧版本，规范字段与工具版本要分开判断。

- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-11

### ENV-12 · `npx` 在本仓库被 devEngines 拒绝，整个检查链要改用 `./node_modules/.bin/`

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` claude-code aafdb13d-7334-4fd2-ad39-0de7eb348fa4（claude-code--aafdb13d-7334-4fd2…md 第 5559–5593、6305–6336、6389–6420 行）

**1. 怎么出现的**
在仓库里跑 `npx oxfmt`/`npx tsc` 等检查，先喷 26 行 `failed to copy trust settings of system certificate-…`，随后报 `EBADDEVENGINES Invalid name "pnpm" does not match "npm" for "packageManager"`——根 `devEngines` 钉死 pnpm，`npx` 被直接拒绝。

**2. 怎么诊断的**
读错误码与 `package.json` 的 `devEngines`/`packageManager`，确认这是 pnpm 仓库对 npm 系工具的保护；改用 `./node_modules/.bin/<tool>` 后同一命令正常。

**3. 提了什么方案**
`npx --yes ...`（仍被 devEngines 拦）；改用 `./node_modules/.bin/`（采用）；`pnpm exec`（在受限沙箱里另有问题，见 ENV-05）。

**4. 最后怎么处理的**
换成 `./node_modules/.bin/` 后 fmt/tsc/lint/test 才能跑。pnpm 仓库里不要用 `npx`，用 `node_modules/.bin` 或 `pnpm exec`。

- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-12

### ENV-13 · 云助手 CLI 两个语义坑：`Output` 默认 base64、`InvocationStatus=Timeout` 是终态却当中间态轮询

`batch` 2026-10-31 · `severity` low · `status` resolved · `source` dsh session-1461740f-95ff-42cf-bf42-4e2c42a6d1d1（dsh--session-1461740f-9…md 第 5906–5917、8092–8134 行）

**1. 怎么出现的**
用阿里云云助手跑命令时，`DescribeInvocationResults` 返回的 `Output` 是 base64，直接当文本读会得到乱码；另一处 `InvocationStatus=Timeout` 已是终态，轮询脚本却把它当中间态继续等，24 次 × 8 秒空转。

**2. 怎么诊断的**
对 base64 输出先 `base64 -d` 才对；对状态码对照 API 文档确认 `Timeout` 在终态集合里，补进轮询退出条件。

**3. 提了什么方案**
输出统一解码（采用）；轮询按“成功/失败/超时”三类终态退出（采用）；延长轮询次数（只是拖延，否）。

**4. 最后怎么处理的**
脚本修好后一次拿到结果。云 API 的字段语义要看文档，不要按名字猜。

- 📎 excerpt: [evidence.gz](./evidence.gz) → ENV-13
