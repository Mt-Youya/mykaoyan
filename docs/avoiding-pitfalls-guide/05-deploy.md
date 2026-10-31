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
