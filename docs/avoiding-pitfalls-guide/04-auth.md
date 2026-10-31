# 4 · 认证与凭据

> 身份模型错位、凭据不进对话、云账号权限与“登录成功”的假象；这一章收认证链路上“看起来登进去了、其实身份或权限不对”的几类失败。

### AUTH-01 · 管理员用邮箱预建，站点只有手机号验证码登录：管理端登不进去

`batch` 2026-10-31 · `severity` high · `status` partial · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27（dsh--session-3e13f3f8…md 第 10688–10696、11649–11665、21003–21015 行）

**1. 怎么出现的**
按用户要求把管理员账号设为某个邮箱：生产库 `accounts` 插入/提升 `email=…, role='admin'`。但站点网页登录只有手机号验证码，agent 自己在报告里写：“以后你用手机号登录会创建一个新账号，不会自动变成这个管理员；需要把那个账号 role 改成 admin（或把手机号绑到邮箱账号上）。”结果就是生产内容发得出去、管理端登不进来。

**2. 怎么诊断的**
为满足“管理员账号设置为某邮箱”，脚本按 email 查、无则建 admin；创建 `scope=publish` 令牌供 CLI 使用。之后才意识到 CLI/API 令牌链路可用，但网页管理端只有 SMS 登录，邮箱账号没有登录入口。

**3. 提了什么方案**
把手机号登录生成的账号 role 改 admin（会话里给了口头 SQL，未执行）；把手机号绑到邮箱账号（需改账号/认证模型）；增加邮箱登录（超出本轮范围）。都未在本会话落实。

**4. 最后怎么处理的**
只有 CLI publish 链路被验证，网页端未验证；该风险直接影响“生产课程上架”的后续操作。预建管理员前要先确认登录方式与账号主键的对应关系。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AUTH-01

### AUTH-02 · 凭据不进对话：交互式配置 + 掩码输出；但脱敏脚本自身也会写错

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-aec02ff6-d93d-4d5a-b94d-fd330bcf9d08（dsh--session-aec02ff6…md 第 1349–1359、1623–1655、1569–1577 行）

**1. 怎么出现的**
需要登录阿里云 ECS。agent 先探测本机没有现成凭据，用问答给出四种方式，推荐用户自己在本机跑 `workbench config`，并明确“AK/SK 不贴到对话里”。用户配好后，`workbench config list` 输出 `AK LTAI****WPPH`（掩码，疑似凭据已脱敏）。但 agent 想读配置文件做正则脱敏时报 `-ireplace 运算符只允许后面包含 2 个元素，而不是 3 个元素`，脱敏脚本没有生效，只输出了 `EXISTS (222 bytes)`。

**2. 怎么诊断的**
先确认本机无任何现成凭据（`MISSING`、`unset`），再让用户选；脱敏失败后没有再强行读原文，凭据只以 CLI 掩码形态出现在会话里。

**3. 提了什么方案**
让用户发 AK/SK 进对话（凭据进会话记录，违反红线，否）；用户本机交互式配置、agent 只做状态检查与掩码输出（采用，代价是不能字段级校验）；用 RAM 角色/STS（更安全但多一步操作）。

**4. 最后怎么处理的**
`config list` 返回 `default / AK / LTAI****WPPH`，后续 `exec` 成功；未验证 `0600` 权限是否真的设置。脱敏脚本本身要测：写错的脱敏等于没有脱敏。


**2026-10-31 增量**  CLI 参数错误默认回显输入，误传 Agent 令牌会泄漏（已改为通用文案 + 回归测试）；排查域名时三次让用户把 AK/连接串发进对话，均被拒绝，最终改为 Cloud Shell + 用户自写 0600 `.env`、agent 只用 `--env-file`；whois/sts 又把注册人信息与账号 ID 打进会话（见 AUTH-06）。

- 📎 增量证据: [evidence.gz](./evidence.gz) → AUTH-02
- 📎 excerpt: [evidence.gz](./evidence.gz) → AUTH-02

### AUTH-03 · 把本机 Wrangler 的 OAuth token 当 API Token 用：`whoami` 报 tokenValid true，读 DNS 仍 403

`batch` 2026-10-31 · `severity` medium · `status` partial · `source` codex 01a17774-3a23-78d1-b0bc-dfa1c4dd1cae（codex--01a17774-3a23-78d1…md 第 3583–3611、3705–3723、4015–4053 行）

**1. 怎么出现的**
上云阶段既要用 `cf` CLI 发布 Worker，又要读 `mykaoyan.cn` 的 DNS 现状。命令行没有登录态，agent 就去读本机 `~/Library/Preferences/.wrangler/config/default.toml`，把 `oauth_token` 提取成 `CLOUDFLARE_API_TOKEN` 环境变量（输出里用 `.replace(token,'[REDACTED]')` 掩盖），判据是 `cf auth whoami` 返回 `"authenticated": true`、`"tokenValid": true`。

**2. 怎么诊断的**
接下去读 DNS 时 API 直接返回 `┌ APIError │ [10000] Authentication error │ 403 Forbidden · HTTP /zones/…/dns_records?name=mykaoyan.cn`，并提示 `Check your API token permissions`。agent 没有去建一枚带 DNS 权限的 API Token，也没有回头质疑 `whoami` 的结论，而是改用浏览器（CUA）打开 Cloudflare 控制台读 DNS 表和部署页；同一枚 token 跑 `deploy:workers` 却成功（`Uploaded mykaoyan-web`、`mykaoyan.cn (custom domain)`）。

**3. 提了什么方案**
A 补一枚有 DNS Read 权限的 Token；B 走浏览器读控制台（采用）。`deploy` 继续复用同一枚 OAuth token。真正的原因是 OAuth 登录态只带交互式会话的 scope，而 API 期望显式权限——这一点没有验证，按 hypothesis 记在诊断里。

**4. 最后怎么处理的**
部署成功，DNS 读回靠浏览器人工完成；`cf dns records list` 的 403 没有被修复，只是被绕开。结论：`whoami` 通过 ≠ 所有 API 可用，用非交互 CLI 操作云 API 前要先实跑目标 API 验证权限。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AUTH-03

### AUTH-04 · 生产校验强制 `SMS_PROVIDER=aliyun`，而资质未办只能用 memory：验证码不留可读通道，登录卡死

`batch` 2026-10-31 · `severity` medium · `status` unresolved · `source` dsh session-1461740f-95ff-42cf-bf42-4e2c42a6d1d1（dsh--session-1461740f-9…md 第 7730–7745、7849–7896、7939–7956、8497–8564、8995–9014 行）

**1. 怎么出现的**
前端与 API 已打通，但 `/api/courses`、`/api/handouts` 返回 `[]`、登录页虽 200 却无法完成登录。根因在运行时：生产模式环境校验要求短信必须走阿里云，而阿里云号码认证的 AccessKey、已审核签名与模板在备案通过前拿不到，只能退回 `NODE_ENV=development` + `SMS_PROVIDER=memory`。

**2. 怎么诊断的**
读 `apps/api/src/environment` 与 `auth/providers.ts`，确认 `production && provider !== "aliyun"` 会直接报 `SMS_PROVIDER` 启动失败；再读 `MemorySmsVerifier` 源码，确认验证码只存在进程 Map 里、`peekCode` 明确“只给测试读取、不出现在任何接口里”，也不写日志——能发的验证码收不到、能校验的验证码看不到。

**3. 提了什么方案**
没有可用绕行方案。如实说明两条路：等阿里云号码认证资质下来后补 `ALIYUN_*` 并把 `NODE_ENV` 改 production；或者先做管理员账号 + 内容上架（但管理员账号本身也要登录，仍被卡住）。

**4. 最后怎么处理的**
用户先选“管理员账号 + 内容上架”、又改口“先沉淀一下本次会话”，两次读取 admin 代码的工具调用被中断。会话以文档沉淀收尾（ADR 0012、`current-deployment.md`、`PLAN.md`、`m0-local.md`），均未 commit；登录不可用、内容为空，目标“显示内容”只到“页面骨架与空列表”。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AUTH-04

### AUTH-05 · 同页登录成功后 `location.assign` 同一地址不刷新，服务端会话没生效

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` codex 01a18698-5b8a-7b62-98d5-02f49296be0b（codex--01a18698-5b8a-7b62…md 第 3052–3112、3161–3180、3322–3340 行）

**1. 怎么出现的**
从会员入口进入 `/login#membership`，`verify()` 成功后 `window.location.assign(loginSuccessPath(window.location.hash))` 回到同一地址 `/login#membership`；浏览器只处理锚点，不重新加载页面，服务端 loader 不重跑，页面仍显示登录表单。

**2. 怎么诊断的**
纯路径函数单测能过（`loginSuccessPath("#membership")` 返回正确路径），但浏览器实测提交后仍停在登录表单；对比普通登录（`/login` → `/`）正常，确认是“同址跳转只处理锚点”的问题。

**3. 提了什么方案**
`loginSuccessPath` 保持锚点，但同一页锚点跳转改为 `window.location.reload()`，其他目标仍 `assign`（采用）；把登录成功页改成独立路由（改动大，否）；轮询会话状态（复杂，否）。

**4. 最后怎么处理的**
改后浏览器实测提交即显示会员期与兑换入口，并补回归测试。同页跳转不会刷新服务端会话，纯路径函数测试覆盖不到这类问题。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AUTH-05

### AUTH-06 · 排查域名时原样跑 whois 与 sts GetCallerIdentity，把注册人姓名/邮箱与 RAM AccountId/Arn 打进会话

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-1461740f-95ff-42cf-bf42-4e2c42a6d1d1（dsh--session-1461740f-9…md 第 2002–2020、4291–4298、4787–4800 行）

**1. 怎么出现的**
排查域名解析时，agent 直接跑 `whois mykaoyan.cn` 看 NS，输出里含域名注册人的真实姓名、邮箱与电话；随后又跑 `aliyun sts GetCallerIdentity`，把 RAM 的 AccountId、PrincipalId、Arn 原样打进对话。同一次会话里加载的 alibabacloud-domain skill 明确写有私有数据 allowlist，仓库红线也禁止把真实个人信息与账号 ID 写进会话。

**2. 怎么诊断的**
事后对照 skill 的 allowlist 与仓库 `docs/PLAN.md §2`，确认 whois 输出的注册人信息、STS 返回的账号标识都在禁止进入会话的清单里；而这些内容已经进了导出记录与报告。

**3. 提了什么方案**
后续查询统一加过滤（只取 NS/状态字段，`grep` 掉注册人段）；STS 只取账号别名不取 ID；报告与指南里一律写 `[redacted]`（采用）。

**4. 最后怎么处理的**
本次会话中的个人与账号信息已无法撤回，只能在产出与归档中脱敏；后续同类排查按 allowlist 过滤。查 whois/STS 前先想清楚哪些字段不能进会话。

- 📎 excerpt: [evidence.gz](./evidence.gz) → AUTH-06
