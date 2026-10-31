# API 上云操作手册（方案 B：Worker 前端 + ECS API）

> 适用：`mykaoyan.cn` 前端继续跑 Cloudflare Worker，`api.mykaoyan.cn` 跑广州 ECS 上的 NestJS API。
> 本文只写操作步骤与取值来源，不记录任何真实密钥、账号、IP。Windows 11 与 macOS 命令分开写。

## 1. 当前状态

| 项 | 状态 |
| --- | --- |
| 广州 ECS | 已购买，备案已提交至管局审核 |
| 备案 | 管局审核中（预估 10 个工作日，最长 20） |
| mykaoyan.cn DNS | 仍在阿里云 hichina；**备案通过前不动**，网站暂不对外 |
| 前端 Worker | 已部署 `mykaoyan-web`，等 NS 切换后生效 |
| ACR 仓库 | 已建 `mykaoyan/api`（华南 3 广州，私有） |
| GitHub `production` | 已配 5 个 secrets + 2 个 variables；`DEPLOY_KNOWN_HOSTS` 已移除（部署时自动抓取主机公钥） |
| API 部署工作流 | 已新增 [.github/workflows/deploy-api.yml](../.github/workflows/deploy-api.yml)：只构建/部署 `api` 镜像 |
| API 镜像入口 | 已改为容器内 `node --import tsx src/main.ts`（`apps/api` 的 `build` 是类型检查，不再依赖 `dist`） |
| Worker `/api` 反代 | 已加到 `apps/web/worker-entry.ts`，`/api/**` 转发到 `https://api.mykaoyan.cn` |

## 2. GitHub `production` environment 配置总表

位置：仓库 → Settings → Environments → `production`。

| 名称 | 类型 | 取值来源 | 状态 |
| --- | --- | --- | --- |
| `ACR_REGISTRY` | Variable | ACR 控制台 → 个人版 → 华南 3（广州）→ 仓库详情页「公网地址」的域名部分 | 已配 |
| `ACR_NAMESPACE` | Variable | `mykaoyan` | 已配 |
| `ACR_USERNAME` | Secret | ACR → 访问凭证页显示的用户名（个人版通常是阿里云账号全名） | 已配 |
| `ACR_PASSWORD` | Secret | 同一页「设置固定密码」设的登录密码（不是阿里云登录密码） | 已配 |
| `DEPLOY_HOST` | Secret | ECS 公网 IP 或绑定的 EIP（**先填 IP**，不要填域名） | 已配 |
| `DEPLOY_USER` | Secret | SSH 登录 ECS 的用户（`whoami` 确认，常见 `root` / `ubuntu`） | 已配 |
| `DEPLOY_SSH_KEY` | Secret | 部署私钥文件全文（含 BEGIN/END 行） | 已配 |

`DEPLOY_KNOWN_HOSTS` 不再是必需 secret：部署工作流在 ECS 上执行前用 `ssh-keyscan -H "$DEPLOY_HOST"` 抓取主机公钥写入 `~/.ssh/known_hosts`（TOFU），并用 SSH 进入容器做健康检查。若要固定指纹，可另加一个可选的 `DEPLOY_KNOWN_HOSTS` secret，并在工作流里优先使用它。

## 3. 主机公钥（自动处理）

- 工作流在「更新 ECS compose」步骤内执行 `ssh-keyscan`，失败会重试 10 次、每次间隔 3 秒；仍取不到则部署失败并提示检查安全组 22 端口。
- 首次部署即信任当次抓到的公钥（TOFU）；换实例/重装系统/换 IP 后无需改 secret，下一次部署自动更新。
- 安全边界：TOFU 不能防御部署机与 ECS 之间的主动 MITM；若需要强校验，把 `ssh-keyscan` 输出保存为 `DEPLOY_KNOWN_HOSTS` secret，并在工作流里改为优先使用该文件。

## 4. 如果还需要重新生成部署 SSH 密钥

### Windows 11

```powershell
# 生成（口令留空，CI 无法交互输入口令）
ssh-keygen -t ed25519 -C "github-actions-mykaoyan" -f "$env:USERPROFILE\.ssh\mykaoyan-deploy"

# 公钥装到 ECS（把 root 换成 DEPLOY_USER）
Get-Content "$env:USERPROFILE\.ssh\mykaoyan-deploy.pub" |
  ssh root@<ECS公网IP> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# 验证
ssh -i "$env:USERPROFILE\.ssh\mykaoyan-deploy" root@<ECS公网IP> "whoami && docker --version"
```

取私钥内容（避免 CRLF 导致 CI 解析失败）：

```powershell
$key = Get-Content "$env:USERPROFILE\.ssh\mykaoyan-deploy" -Raw
$key = $key -replace "`r`n", "`n"
$key | Set-Clipboard
```

粘贴进 `DEPLOY_SSH_KEY`。

### macOS

```bash
ssh-keygen -t ed25519 -C "github-actions-mykaoyan" -f ~/.ssh/mykaoyan-deploy -N ""
ssh-copy-id -i ~/.ssh/mykaoyan-deploy.pub root@<ECS公网IP>
ssh -i ~/.ssh/mykaoyan-deploy root@<ECS公网IP> "whoami && docker --version"
cat ~/.ssh/mykaoyan-deploy   # 全文填 DEPLOY_SSH_KEY
```

## 5. ECS 准备（备案通过前就能做）

```bash
docker --version
docker compose version          # 必须是 v2；没有就 sudo apt-get install -y docker-compose-v2
sudo mkdir -p /opt/mykaoyan-api
sudo chown -R "$USER":"$USER" /opt/mykaoyan-api
```

安全组：

- 22：放行（务必只允许密钥登录，禁用密码登录）
- 80/443：**备案通过后再放行**
- 80 还要留给 Caddy 申请 Let's Encrypt 证书（HTTP-01）

## 6. ECS 上的 `/opt/mykaoyan-api/.env`

完整的创建步骤、变量模板与校验命令见 [ECS API 运行时配置](./ecs-api-env.md)。

`chmod 600`，只放在 ECS，不进仓库、不进镜像。

| 变量 | 来源 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | 固定 | `production` |
| `PORT` | 固定 | `3001` |
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string → **Transaction pooler（6543）** | 必须是 6543 且带 `sslmode=verify-full`；密码替换成项目密码 |
| `DATABASE_CA` | Supabase → Database → SSL Configuration 的 CA 证书 | 可选；`verify-full` 校验失败时再填，不能填空串 |
| `MEDIA_SIGNING_KEY` | 与媒体 Worker 的 secret 相同 | ≥32 字符，API 签发、Worker 验签 |
| `MEDIA_BASE_URL` | 媒体 Worker 的自定义域名 | 可选；用于拼接播放地址 |
| `BETTER_AUTH_SECRET` | 自己生成 | ≥32 字符；`openssl rand -hex 32` 或 PowerShell 随机 64 位 hex |
| `BETTER_AUTH_URL` | `https://mykaoyan.cn` | 前端公开地址（登录走同源 `/api` 代理） |
| `AUTH_TRUSTED_ORIGINS` | `https://mykaoyan.cn` | 允许携带 cookie 调认证接口的 origin |
| `AUTH_COOKIE_DOMAIN` | `mykaoyan.cn` | 会话 cookie 放到根域，页面与 API 跨子域共享登录态 |
| `SMS_PROVIDER` | 固定 | 生产必须是 `aliyun` |
| `ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET` | RAM 控制台创建子账号 AK | 只授予短信/号码认证权限 |
| `ALIYUN_SMS_SIGN_NAME` | 阿里云短信控制台 | 已审核通过的签名 |
| `ALIYUN_SMS_TEMPLATE_CODE` | 阿里云短信控制台 | 验证码模板 CODE |
| `ALIYUN_SMS_TEMPLATE_PARAM` | 默认 `{"code":"##code##","min":"5"}` | 与模板变量名一致 |

> 代码侧会补 Better Auth 的跨子域 cookie（Domain=`.mykaoyan.cn`），否则 `api.mykaoyan.cn` 上设置的 cookie 浏览器不会带到 `mykaoyan.cn`。

## 7. 数据库迁移（API 上线前）

工作流：[.github/workflows/migrations.yml](../.github/workflows/migrations.yml)，手动触发，使用环境 `database-dev` / `database-prod`，各需要一个 secret：

| Environment | Secret | 取值 |
| --- | --- | --- |
| `database-dev` | `MIGRATION_DATABASE_URL` | Supabase **Session/Direct（5432）** 连接串，替换密码 |
| `database-prod` | `MIGRATION_DATABASE_URL` | 同上；正式库才填 |

注意：

- 不要拿同一个库连跑 dev 和 prod 两遍；只有一套 Supabase 时，只配 `database-prod` 或只跑一次并核对 `migration list`。
- 迁移用 5432，不要用 6543（事务池不支持 DDL）。

## 8. 备案通过后的上线顺序

1. **切 NS**：阿里云域名控制台 → mykaoyan.cn → DNS 修改 → 填 Cloudflare 给的两台：
   `micah.ns.cloudflare.com`、`sandra.ns.cloudflare.com`
2. 等解析生效：`curl -s 'https://dns.google/resolve?name=mykaoyan.cn&type=NS'` 应返回上面两台。
3. Cloudflare DNS 加 `api` 记录：A → ECS 公网 IP，**仅 DNS（灰云）**；Caddy 要用 HTTP-01 签证书。
4. 安全组放行 80、443。
5. 跑 `migrations.yml`（先核对 migration list）。
6. 在 `/opt/mykaoyan-api/.env` 放好运行时变量（见第 6 节），然后跑 `deploy-api.yml`：
   - 构建 `api` 镜像并推 ACR
   - 把 `deploy/api-compose.yaml` 复制为 `/opt/mykaoyan-api/api-compose.yaml`、`deploy/api-Caddyfile` 复制为 `/opt/mykaoyan-api/Caddyfile`
   - `docker compose -f api-compose.yaml pull && up -d`，冒烟 `/api/health`
7. 验收 API：

```bash
curl -s https://api.mykaoyan.cn/api/health
# 期望 {"status":"ok","database":"connected"}
```

8. 重新发布 Worker（让 `/api` 反代生效）：

```bash
pnpm --filter @mykaoyan/web build:workers
pnpm --filter @mykaoyan/web deploy:workers
```

再打开 `https://mykaoyan.cn`，试招生查询、课程/讲义、登录。

9. 备案通过后补前端底部备案号（链接 `https://beian.miit.gov.cn/`）。

## 9. 验证与回滚

- 部署 workflow 冒烟失败会红，但不会自动回滚；按上一次镜像 tag 重新 `docker compose up -d`。
- ECS 上查看：`cd /opt/mykaoyan-api && docker compose ps && docker compose logs --tail=100 api`。
- 数据库迁移不自动回滚；迁移前确认备份（`operations.yml` 的备份流程）。

## 10. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `ssh-keyscan` 输出为空 | 22 未放行 / 网络拦截 | 安全组放行 22；或用 ECS 上的公钥拼 known_hosts |
| CI 报 `Permission denied (publickey)` | 私钥与 ECS `authorized_keys` 不匹配 / 用户错 | 重新 `ssh-copy-id`，确认 `DEPLOY_USER` |
| CI 报主机校验失败 | known_hosts 与当前 IP 不符 | 重新生成 `DEPLOY_KNOWN_HOSTS` |
| `docker login` 失败 | 用成了阿里云登录密码 | 用 ACR「访问凭证」里的固定密码 |
| `docker compose` 不存在 | 只装了 Docker | `sudo apt-get install -y docker-compose-v2` |
| API 容器起不来 | 查看 `docker compose logs api`；入口是 `node --import tsx src/main.ts`，需要镜像内 `tsx` 依赖（已声明在 `apps/api` dependencies） | 按日志修环境变量或依赖 |
| `api.mykaoyan.cn` 404/超时 | DNS 未指向 ECS、443 未放行、Caddy 证书未签 | 按第 8 节顺序检查 |
| 登录后立刻掉线 | cookie 只在 `api` 子域 | 代码侧跨子域 cookie 配置 |

## 11. Windows 11 一次性检查脚本（PowerShell）

```powershell
Get-Command ssh, ssh-keygen, ssh-keyscan
ssh -i "$env:USERPROFILE\.ssh\mykaoyan-deploy" <DEPLOY_USER>@<ECS公网IP> "whoami; docker --version; docker compose version"
ssh-keyscan -H <ECS公网IP> 2>$null | Out-File -Encoding ascii "$env:USERPROFILE\known_hosts.txt"
Get-Content "$env:USERPROFILE\known_hosts.txt"
```
