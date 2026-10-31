# 5 · 部署与生产操作

> 一次“上传代码”背后有 SSH 主机密钥、镜像仓库、Docker 构建上下文、ECS 运行时配置四层；这一章收这条链上真实断掉的点。

### DEPLOY-01 · 部署 workflow 硬性要求 `DEPLOY_KNOWN_HOSTS`，用户暴怒后才承认是自己加的

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27（dsh--session-3e13f3f8…md 第 44282–44345、45079–45132 行）

**1. 怎么出现的**
第一版交付说明写“唯一阻塞：生产部署缺少 GitHub Secret `DEPLOY_KNOWN_HOSTS`”，要求用户执行 `ssh-keyscan -H <ECS IP> | gh secret set ...`；workflow 里是 `: "${DEPLOY_KNOWN_HOSTS:?}"`，缺 secret 就失败。用户回：“为什么一定要 DEPLOY_KNOWN_HOSTS？？？？”

**2. 怎么诊断的**
被质问后 agent 承认：“`DEPLOY_KNOWN_HOSTS` 本身不是 SSH/部署的硬性前提，它只是主机密钥校验……这个设计太死板”，随后改成部署时在 runner 上 `ssh-keyscan -H "$DEPLOY_HOST"` 自动抓取公钥写入 `~/.ssh/known_hosts`（TOFU，仍保留默认严格校验）。

**3. 提了什么方案**
保留 secret 但设为 optional：有则 pin，无则风险提示（推荐，本轮没做）；把 host key 指纹写进 runbook 让站主确认（安全但多一步）；完全关闭校验（最差，未采用）。TOFU 相比固定 host key 失去“首次即信任”的中间人防护，属于安全降级，回复里没有提示取舍。

**4. 最后怎么处理的**
`a712880` 移除硬校验，后续部署 run 成功、API health 200。部署前置条件要区分“安全建议”和“硬依赖”，不能把自己写的可选校验写成用户必须补的 secret。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-01

### DEPLOY-02 · 镜像仓库域名 NXDOMAIN：ACR 个人版实例已失效，改走 SSH 直传镜像

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27（dsh--session-3e13f3f8…md 第 45085–45132、46032–46070 行）

**1. 怎么出现的**
工作流在“校验部署配置并推送镜像”阶段失败：`Get "https://crpi-…cn-guangzhou.personal.cr.aliyuncs.com/v2/": dial tcp: lookup … no such host`。本机与 8.8.8.8 查询均 NXDOMAIN，`registry.cn-guangzhou.aliyuncs.com` 正常——ACR 个人版实例域名本身已经不存在。

**2. 怎么诊断的**
先确认不是 GitHub 网络问题（域名解析失败），再向用户要实例信息；判定 ACR 不可用后，改为 runner 构建镜像 → `docker save | gzip` → SSH → ECS `docker load` → `docker compose up -d`，部署脚本 commit 后成功。

**3. 提了什么方案**
修复/重建 ACR 并更新 `ACR_REGISTRY`（依赖用户恢复云资源，否）；完全绕开 registry、SSH 传镜像（采用，每次数百 MB、更慢但无外部依赖）；在 ECS 上直接构建（污染生产机，否）。

**4. 最后怎么处理的**
手动部署 run 成功，runbook 记录“不再经过任何 registry，代价是每次部署多传约数百 MB”。外部 registry 是单点，部署脚本要有一条不依赖它的后备路径。


**2026-10-31 增量**  指导 ACR 个人版时先给通用 registry 地址，“命名空间下拉为空”其实是建仓库时代码源选错，用户两次纠正后才给对。

- 📎 增量证据: [evidence.gz](./evidence.gz) → DEPLOY-02
- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-02

### DEPLOY-03 · `.dockerignore` 白名单漏了 `scripts/`、`skills/`，镜像内 postinstall 失败

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27（dsh--session-3e13f3f8…md 第 45745–45800、45891–45913 行）

**1. 怎么出现的**
“构建 web 与 api 镜像”失败：`ERR_PNPM_EXECUTOR_LIFECYCLE_SCRIPT_FAILED`，`/workspace postinstall: node scripts/link-skills.mjs exited with exit status: 1`。根因是 `.dockerignore` 白名单只有 `apps/**`、`packages/**`，没有 `scripts/`、`skills/`；更早一轮还撞上 pnpm 版本签名校验失败。

**2. 怎么诊断的**
先用 `--log-failed` 抓到 postinstall 失败，再对照根 `package.json` 的 `"postinstall": "node scripts/link-skills.mjs"` 与 `.dockerignore` 白名单；第一次 edit 因“file has not been read”失败，随后 `git add .dockerignore && git commit` 输出 `no changes added to commit`、push 失败；读文件后正确 edit，加入 `!scripts/`、`!scripts/**`、`!skills/`、`!skills/**`。

**3. 提了什么方案**
把 link-skills 设为可选或镜像内 `--ignore-scripts`（快，但镜像里没有技能链接，与 CI 不一致）；补齐 `.dockerignore` 白名单（采用，正确）；拆 postinstall（改动大）。

**4. 最后怎么处理的**
下一轮“构建镜像”步骤通过，manifest 成功。镜像构建上下文与 CI 工作区不是同一个东西，postinstall 依赖的目录必须在白名单里。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-03

### DEPLOY-04 · ECS 运行时 `.env` 缺生产短信配置，API 容器 restart loop，部署“成功”但登录不可用

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27（dsh--session-3e13f3f8…md 第 46032–46070、46460–46473、48590–48602 行）

**1. 怎么出现的**
compose 启动报 `env file /opt/mykaoyan/.env not found`；补 symlink 后 API 容器 `Restarting (1)`，`docker logs` 为 `认证启动配置缺失或无效：SMS_PROVIDER`；健康检查 30 次失败。后来又发现 Supabase 连接 `SELF_SIGNED_CERT_IN_CHAIN`，`DATABASE_CA` 缺失。

**2. 怎么诊断的**
先 symlink `.env`，再临时加诊断 workflow 看容器状态/日志定位到 `SMS_PROVIDER`；用临时 workflow 写入占位短信配置让 API 先启动（此时“页面可读、登录不可用”）；从 TLS 链提取 `Supabase Root 2021 CA` 写入 `DATABASE_CA`（ca 字符数 1405），`db-query-ok`、health `{"status":"ok","database":"connected"}`。

**3. 提了什么方案**
部署前 `docker compose config` + 必需变量清单 fail-fast（未做，只写进 runbook）；用占位配置先启动（已做，但必须显式说明半可用）；补 CA 后重启（已做）。

**4. 最后怎么处理的**
三容器 Up、API 健康 200，但短信凭据仍是占位，回复里明确“手机登录不可用”，直到用户补真实凭据才闭环。“部署成功”至少分三层：容器起来、健康检查通过、登录/写路径可用。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-04

### DEPLOY-05 · `cf build --mode workers` 不支持自定义 mode：要构建 `vite build --mode workers`，发布才用 `cf deploy --prebuilt`

`batch` 2026-10-31 · `severity` low · `status` resolved · `source` codex 01a17774-3a23-78d1-b0bc-dfa1c4dd1cae（codex--01a17774-3a23-78d1…md 第 3557–3591 行）

**1. 怎么出现的**
给 `apps/web` 加 Workers 构建脚本时，agent 按 `deploy:workers` 的写法把构建也写成 `cf build --mode workers`。实际执行时 `cf` 会去探测框架构建命令（`npx vite build`），然后报 `┌ Error │ The detected command \`npx vite build\` does not currently support \`--mode\`.`，`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`，整个 `pnpm recursive run` 失败退出 1。

**2. 怎么诊断的**
读构建日志尾部，看到错误块与 `[ELIFECYCLE] Command failed with exit code 1.`；对比 `deploy:workers`（`cf deploy --prebuilt --mode workers --no-provision`）可知 `--mode` 是给 Vite 的，不是给 `cf build` 的自动探测包装器。

**3. 提了什么方案**
继续找 `cf build` 传 mode 的正确方式（官方 beta 未提供，放弃）；构建直接调 `vite build --mode workers`，发布仍用 `cf deploy --prebuilt --mode workers --no-provision`（采用）。代价是牺牲 `cf build` 的自动配置能力，换取可控的 Vite mode。

**4. 最后怎么处理的**
改脚本后构建成功（130 + 183 个模块，产出 assets 与 ssr bundle），后续 `deploy --dry-run` 与真实部署都用这份产物；`cf build` 这条路没有再被使用，也没有确认后续版本是否修复。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-05

### DEPLOY-06 · Cloudflare Workers Builds 默认 `npx wrangler deploy` 在 pnpm 仓库被打红（EBADDEVENGINES），云端 Worker 名还与 `wrangler.jsonc` 不一致

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` codex 01a17774-3a23-78d1-b0bc-dfa1c4dd1cae、claude-code aafdb13d-7334-4fd2-ad39-0de7eb348fa4（codex--01a17774-3a23-78d1…md 第 2506–2524、2549–2580、2955–3002、3225–3245 行；claude-code--aafdb13d-7334-4fd2…md 第 1805–1835、1841–1857、1861–1875、1882–1909 行）

**1. 怎么出现的**
用户直接贴“构建失败，你看下什么情况”。Cloudflare `mykaoyan` 那条构建 `c85c3f7a…` 状态 `stopped / fail`：默认构建命令 `pnpm run build` 成功，部署阶段默认 `npx wrangler deploy` 报 `npm error EBADDEVENGINES Invalid name "pnpm" does not match "npm" for "packageManager"`。同时云端 Worker 叫 `mykaoyan`，仓库 `wrangler.jsonc` 里却是 `mykaoyan-media`。

**2. 怎么诊断的**
先查 `workers_list`、`workers_builds_list_builds`、`get_build`、`get_build_logs`，把“构建成功”和“部署失败”分开；再读 Cloudflare 构建配置文档，确认 default deploy command 与 root directory 的行为。MCP 连接只能读构建信息，改配置只能走浏览器控制台（CUA），改完 reload 读回三项配置并留截图。

**3. 提了什么方案**
根目录设成 `apps/media-worker`、构建命令留空、部署命令设 `pnpm exec wrangler deploy --name mykaoyan`（采用，`--name` 指向已存在的云端 Worker）；把云端 Worker 改名成 `mykaoyan-media`（否，未授权且会动生产）；把仓库配置改成 `mykaoyan`（否，R2 桶仍叫 `mykaoyan-media`）。

**4. 最后怎么处理的**
配置保存后重试一次，仍失败：`✘ [ERROR] The following required secrets have not been set: MEDIA_SIGNING_KEY`；用 `wrangler secret put` 配好同名密钥后再重试，构建成功、`media.mykaoyan.cn` 自定义域生效。接一个已存在的 Cloudflare 项目，先读 `buildCommand / deployCommand / root directory` 三项并与仓库包管理器、`wrangler.jsonc` 的 `name` 对照。


**2026-10-31 增量**  同一天另一个会话也撞上同一组合：默认 `npx wrangler deploy` 被 devEngines 拒绝 + Worker 名不一致 + 缺 `MEDIA_SIGNING_KEY`，说明这是接现有 Cloudflare 项目的固定前置检查。

- 📎 增量证据: [evidence.gz](./evidence.gz) → DEPLOY-06
- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-06

### DEPLOY-07 · 一次失败的重试部署也会真实创建云资源：Wrangler 自动开通 R2 桶 `mykaoyan-media`（WEUR）

`batch` 2026-10-31 · `severity` high · `status` partial · `source` codex 01a17774-3a23-78d1-b0bc-dfa1c4dd1cae（codex--01a17774-3a23-78d1…md 第 2885–2905、2990–3006、3006–3022 行）

**1. 怎么出现的**
用户原话是“现在重试一次 mykaoyan 媒体 Worker 的部署”，授权范围只有重试部署。构建日志在部署失败前先打印 `The following bindings need to be provisioned: env.BUCKET R2 Bucket`，然后自动执行：
`Resource name found in config: mykaoyan-media` → `🌀 Creating new R2 Bucket "mykaoyan-media"...` → `✨ BUCKET provisioned 🎉`，最后才因 `MEDIA_SIGNING_KEY` 缺失退出。失败的是部署，成功的是资源创建。

**2. 怎么诊断的**
从 `workers_builds_get_build_logs` 的部署段读出 provisioning 段；再用 `r2_bucket_get` 读回桶名、`creation_date 2026-10-27T02:22:35.432Z`、`location WEUR`，确认不是日志误报；对照仓库 `wrangler.jsonc`——桶只写了名字、没有绑定 id，属于 Cloudflare 的自动开通行为。

**3. 提了什么方案**
保留并使用该桶（采用，后续媒体链路依赖它）；回滚/删除桶（否，删除云资源未获授权）；给配置补显式 id 或先在控制台建桶再部署（本会话未做）。没有为“失败部署也会建资源”加防护。

**4. 最后怎么处理的**
桶保留在 `WEUR`，与项目想要的区域（大陆/新加坡附近）是否一致没有核对；本会话没有回滚、没有配额/费用评估，也没有把这一副作用写进部署文档。部署前先看 `wrangler deploy --dry-run` 是否列出 “bindings need to be provisioned”，把可能的资源创建写进授权请求里。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-07

### DEPLOY-08 · `wrangler.jsonc` 不是纯 JSON：测试里 `JSON.parse` 直接 SyntaxError，要用 `unstable_readConfig`

`batch` 2026-10-31 · `severity` low · `status` resolved · `source` codex 01a17774-3a23-78d1-b0bc-dfa1c4dd1cae（codex--01a17774-3a23-78d1…md 第 1278–1296、1300–1318 行）

**1. 怎么出现的**
media-worker 的单元测试需要读 `wrangler.jsonc` 里的 `ALLOWED_ORIGINS` 和变量，测试先按纯 JSON 处理（`readFileSync` + 正则删行首 `//` 注释 + `JSON.parse`），仍报 `SyntaxError: Expected double-quoted property name in JSON at position 654 (line 18 column 3)`。

**2. 怎么诊断的**
没有继续猜“哪一行注释没删干净”，而是查 wrangler 自身的配置读取入口，在 `wrangler-dist/cli.d.ts` 与文档里找到 `unstable_readConfig`，改成由 wrangler 解析配置；同时把测试里 `ALLOWED_ORIGINS` 的类型收窄为 `readonly string[]`。

**3. 提了什么方案**
手写 JSONC 解析（否，注释、尾逗号、schema 演进都会让测试与 wrangler 行为漂移）；`wrangler types` 生成的 `Env` 代替读配置（否，`vars` 不在生成类型里）；`unstable_readConfig`（采用，代价是 API 带 `unstable` 前缀）。

**4. 最后怎么处理的**
media-worker 测试恢复并与后续用例一起通过，本地 workerd + R2 模拟跑通完整内容、206、304、无效令牌拒绝。风险是 `unstable_readConfig` 随 wrangler 小版本变动，仓库因此把 wrangler 钉在 `4.152.0`。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-08

### DEPLOY-09 · Worker 部署成功、Custom Domain 也绑定了，但权威 DNS 还在万网：浏览器 `NXDOMAIN`，边缘直连 200 只证明部署生效

`batch` 2026-10-31 · `severity` high · `status` unresolved · `source` dsh session-167c8cf8-953d-49c0-a097-38cab9ebe47c（dsh--session-167c8cf8-9…md 第 14575–14620、14743–14767、15237–15279、15360–15367、15588–15592 行）

**1. 怎么出现的**
代码修好后要部署前端 Worker。本机 `cf auth list` 是空的，agent 发起 OAuth 登录，第一次直接 `fetch failed`（到 Cloudflare API 的网络不稳）。用户手动完成登录后部署成功，控制台与 `deploy` 输出都显示 Custom Domain `mykaoyan.cn` 已绑定、版本 `ce549b86`。

**2. 怎么诊断的**
agent 先按“部署即上线”验证，`dig +short mykaoyan.cn` 拿不到 IP，只能用 `curl --resolve mykaoyan.cn:443:<边缘 IP>` 探测，`/`、`/admissions` 返回 200，`/api/*` 404。用户浏览器报 `DNS_PROBE_FINISHED_NXDOMAIN` 后，agent 才把“部署”和“域名解析”分开查：Cloudflare 分配的 NS 是 `micah/sandra.ns.cloudflare.com`，注册局（CNNIC）当前 NS 仍是 `dns23/dns24.hichina.com`，阿里云侧根域无 A 记录，所以浏览器解析到阿里云 DNS 后 NXDOMAIN。

**3. 提了什么方案**
A 在阿里云根域加 A 记录指向 Cloudflare 边缘做临时绕过（拒绝：非官方接入、免费版不支持 CNAME、IP 变化/证书校验会坏）；B 等备案通过后把 NS 切到 Cloudflare（采用，需用户在阿里云控制台操作，并等注册局生效）。

**4. 最后怎么处理的**
Worker 已上线但域名仍不可访问；agent 把 NS 切换步骤、验证命令和“生效后 `/api/*` 仍 404”的边界写给用户，本次评审范围内没看到 NS 切换完成，因此按 unresolved 记录。部署后必须分别验证“部署生效”（控制台/边缘直连）与“域名可访问”（公共 DNS 解析 + 浏览器）；`curl --resolve` 成功不能当用户能打开。


**2026-10-31 增量**  部署后冒烟打 `https://mykaoyan.cn`：DNS 还指向 Worker 时请求会打到 Worker，ECS 坏了也显示成功——冒烟要区分命中的是哪一层。

- 📎 增量证据: [evidence.gz](./evidence.gz) → DEPLOY-09
- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-09

### DEPLOY-10 · 未备案域名被阿里云按 Host 头拦截：纯 IP 200、带域名 403，换非标端口也照拦

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-1461740f-95ff-42cf-bf42-4e2c42a6d1d1（dsh--session-1461740f-9…md 第 5255–5274、5288–5317 行）

**1. 怎么出现的**
容器在 ECS 上跑通、本机 `curl 127.0.0.1:8080/` 200、标题正确，但用户报“http://mykaoyan.cn:8080/ 为什么还是访问不了？”。此前 agent 判断“阿里云只拦 80/443 的 HTTP/HTTPS，非标端口可以用”，还建议用户加 A 记录后用 `mykaoyan.cn:8080` 验收。

**2. 怎么诊断的**
05:03 做三组对照：`curl http://mykaoyan.cn:8080/` → 403、`<title>Non-compliance ICP Filing</title>`；`curl http://<IP>:8080/` → 200；`curl -H 'Host: mykaoyan.cn' http://<IP>:8080/` → 同一张 403 拦截页。403 正文直接 iframe 了阿里云备案拦截页——容器、安全组、前端问题全部排除。

**3. 提了什么方案**
更正判断并给出硬结论“备案通过之前，任何带域名的访问都不可能通”；建议把刚加的两条 A 记录删掉（域名反正打不开，留着反而给“未备案域名已指向服务器”的信号），预览只用纯 IP。

**4. 最后怎么处理的**
用户回“删掉”，agent 执行 `aliyun alidns DeleteDomainRecord` 删除 @ 与 www，读回 `TotalCount: 0`，纯 IP 仍 200。境内云排查“域名打不开”先做纯 IP / 伪造 Host / 域名三组对照。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-10

### DEPLOY-11 · 本机走多出口 NAT，`/32` 白名单「加了也没用」：两次查询拿到两个不同出口 IP

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-1461740f-95ff-42cf-bf42-4e2c42a6d1d1（dsh--session-1461740f-9…md 第 5039–5058、5062–5093、5095–5134 行）

**1. 怎么出现的**
安全组原本只开放 22/80/443/3389，8080 一律超时。agent 给了“只放行当前出口 IP（`/32`，推荐）”与“全网放行”两条路；用户跑了 `/32` 那条，回“已经加了但是没用”。

**2. 怎么诊断的**
读回安全组确认 `TCP 8080 [redacted]/32` 规则确实生效，但端口仍超时；`ifconfig.me` 返回空，换四个服务查出口 IP：`checkip.amazonaws.com` 与 `ipinfo.io` 返回两个不同地址——这台机器出网是多出口 NAT，`/32` 白名单必然时通时不通。

**3. 提了什么方案**
删除 `/32` 规则、改 `0.0.0.0/0` 放行 8080（采用，同时提示这是“别人也能访问”且明文 HTTP 只适合临时预览）；备案通过后删掉临时规则、改 Caddy 走 80/443。

**4. 最后怎么处理的**
执行 `RevokeSecurityGroup` + `AuthorizeSecurityGroup`，端口 succeeded、`mykaoyan.cn:8080` 200、资源 200，另用无头 Chrome 从公网截图确认渲染正常。给“只放行我的 IP”建议前先用两个独立服务核对出口 IP 稳定性。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-11

### DEPLOY-12 · 手动部署 workflow 首跑就会失败：API 镜像不产出 dist、Worker 不转发 /api、跨子域 cookie 未配

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-167c8cf8-953d-49c0-a097-38cab9ebe47c（dsh--session-167c8cf8-9…md 第 15925–15930、17219–17231、18336–18474、18778–18862、19079–19123 行）

**1. 怎么出现的**
上线前静态审查手动部署 workflow，一次发现四处硬伤：API 镜像 build 不产出 `dist`、Worker 不转发 `/api`、跨子域 cookie 未配置、健康检查命令与容器入口不匹配。任何一处都会让首跑失败。

**2. 怎么诊断的**
逐段对照 Dockerfile、compose、Caddy 与 Worker 配置：镜像里 `build` 与 `start` 用的路径不一致；Worker 路由只匹配静态资源；cookie 域没写 `.mykaoyan.cn`；healthcheck 打到未监听的端口。

**3. 提了什么方案**
四处一起修（采用）；先上线再撞（否）；把 API 与前端合并到一个进程（架构改动，否）。修完在本地按 Dockerfile 真 build/run 一次再谈上线。

**4. 最后怎么处理的**
全部修好并在本地验证；但本机没有 Docker，镜像未真正 build，“部署成功”仍未验证——静态审查只能发现配置矛盾。部署前按 Dockerfile 真 build/run 一次。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-12

### DEPLOY-13 · 本机 `node --import tsx` 能跑不等于 `pnpm deploy` 产物能跑：发布包缺 tsconfig，容器里装饰器编译报错直接崩

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-167c8cf8-953d-49c0-a097-38cab9ebe47c（dsh--session-167c8cf8-9…md 第 19702–19756、19759–19790、19847–19905、19927–19936 行）

**1. 怎么出现的**
本机用 `node --import tsx` 跑 API 一切正常；但 `pnpm deploy` 生成的发布包缺自包含 `tsconfig`，容器启动时装饰器相关编译报错直接崩，进程退出。

**2. 怎么诊断的**
对比本机运行时与发布包内容：`pnpm deploy` 只带依赖与源码，不带根 `tsconfig`；容器里没有 tsx 读取的装饰器配置，入口在第一次加载就失败。

**3. 提了什么方案**
Dockerfile 把自包含 `tsconfig.json` 复制成 `/app/tsconfig.json`（采用）；把 tsconfig 打进包内（需改发布配置，未做）；放弃 tsx、走编译产物（与 MOD-01 的取舍冲突）。

**4. 最后怎么处理的**
补 tsconfig 后容器入口能启动；本机无 Docker 未真正 build，风险仍在。发布包的运行条件要按容器实际文件清单验证，而不是按本机命令验证。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-13

### DEPLOY-15 · ICP 备案备注建议写「不涉及评论、用户上传音视频」，与仓库规划 M4 的评论与投稿视频冲突

`batch` 2026-10-31 · `severity` medium · `status` unresolved · `source` codex 01a17b19-0f6d-7fb2-98d5-352b34db2475（codex--01a17b19-0f6d-7fb2…md 第 284–292、293–303 行）

**1. 怎么出现的**
备案材料里 agent 建议把经营范围备注写成“不涉及论坛、评论、用户上传音视频”，理由是方便过审；但仓库 `GLOSSARY.md`/`PLAN.md` 的 M4 明确要上线评论与投稿视频。

**2. 怎么诊断的**
对照 PLAN §4–§5 与工单 21–23，确认评论、投稿（含视频）是已规划功能；备案口径与产品实际能力不一致，属于对监管的失实陈述。

**3. 提了什么方案**
按实际功能如实申报（推荐）；先按“不涉及”报、上线后再变更（风险高，未采用）；砍掉评论/投稿功能（与产品目标冲突，否）。

**4. 最后怎么处理的**
本会话没有改备案材料，问题按 unresolved 留给用户决定。备案口径必须与产品功能规划一致，不能为了过审写不实备注。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-15

### DEPLOY-16 · 课程发布链路七处缺口：上传成功访客也看不到，线上镜像还不含发布 API/CLI

`batch` 2026-10-31 · `severity` high · `status` unresolved · `source` dsh session-90c1dae4-3910-4666-819d-d54ad5bb28b4（dsh--session-90c1dae4-3…md 第 4329–4352、4391–4414、4684–4703、4705–4716、6609–6621 行）

**1. 怎么出现的**
准备“上传课程”时逐项核对链路，发现七处缺口：课程/章没有上下架接口、发布 API/CLI 未提交未部署、生产库只推了 5/7 个迁移、ECS `.env` 缺 R2 五项、`media.mykaoyan.cn` 可解析性存疑、CLI 拒绝公网 http（备案前需 SSH 转发）、课程 summary 无写入口。

**2. 怎么诊断的**
从 CLI 命令到 API 到数据库到 R2/媒体域逐层核对：代码是否提交、迁移是否应用、环境变量是否齐全、域名是否可达；每层都有缺口。

**3. 提了什么方案**
按“上传=上线”的最小闭包逐项补齐（采用为方案）；先上传再让访客等（否，会得到“上传成功但看不到”）；绕过 CLI 手工插库（破坏契约，否）。

**4. 最后怎么处理的**
七处缺口写进报告，本会话未全部修复；上传成功不等于访客可见。内容上线前先核对“代码已部署 + 迁移已应用 + env 齐全 + 媒体域可达 + 上下架接口存在”。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DEPLOY-16
