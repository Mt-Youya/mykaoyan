# ECS API 运行时配置：`/opt/mykaoyan-api/.env`

> 适用：方案 B，`api.mykaoyan.cn` 跑在广州 ECS 的 Docker 容器里。
> 本文只讲 `.env` 的位置、创建方式、变量来源与校验；不含任何真实密钥。
> 关联文档：[API 上云操作手册](./deploy-api-runbook.md)。

## 1. 它是什么

- API 容器的运行时环境变量文件，由 `deploy/api-compose.yaml` 里的 `env_file: .env` 读取。
- 只存在于 ECS 的 `/opt/mykaoyan-api/.env`，**不进 Git、不进镜像、不发聊天**。
- 部署 workflow（`deploy-api.yml`）不会覆盖它；每次部署只更新 `.env.images`（镜像引用）。

## 2. 在 ECS 上创建

SSH 登录（Windows 11 / macOS 都可以）：

```bash
ssh <DEPLOY_USER>@<ECS公网IP>
```

创建目录与文件：

```bash
sudo mkdir -p /opt/mykaoyan-api
sudo chown "$USER":"$USER" /opt/mykaoyan-api
umask 077
nano /opt/mykaoyan-api/.env
```

没有 `nano` 时可用 `vi`，或用 heredoc：

```bash
cat > /opt/mykaoyan-api/.env <<'EOF'
...内容见第 3 节...
EOF
chmod 600 /opt/mykaoyan-api/.env
```

要求：

- 文件名必须是 `.env`，目录必须是 `/opt/mykaoyan-api/`。
- 不要写 `export`。
- 不要加多余空格；值里出现 `#` 时才需要考虑引号。
- 值里尽量避免 `$`（Compose 会做变量插值）。

## 3. 变量模板

```dotenv
# 运行环境
NODE_ENV=production
PORT=3001

# 数据库：Supabase 事务连接池 6543，必须带 sslmode=verify-full
DATABASE_URL=postgresql://postgres.<project-ref>:<URL编码后的密码>@<region>.pooler.supabase.com:6543/postgres?sslmode=verify-full
# 可选：TLS 校验失败时再填 Supabase 的 CA 证书；多行 PEM 先不要直接塞
# DATABASE_CA=

# 认证
BETTER_AUTH_SECRET=<64 位 hex>
BETTER_AUTH_URL=https://mykaoyan.cn
AUTH_TRUSTED_ORIGINS=https://mykaoyan.cn
AUTH_COOKIE_DOMAIN=mykaoyan.cn

# 短信：生产只能是 aliyun
SMS_PROVIDER=aliyun
ALIYUN_ACCESS_KEY_ID=<RAM 子账号 AK>
ALIYUN_ACCESS_KEY_SECRET=<RAM 子账号 SK>
ALIYUN_SMS_SIGN_NAME=<已审核通过的签名>
ALIYUN_SMS_TEMPLATE_CODE=<已审核通过的模板 CODE>
# 可选，默认值如下
# ALIYUN_SMS_TEMPLATE_PARAM={"code":"##code##","min":"5"}

# 媒体签名：必须与媒体 Worker 的 MEDIA_SIGNING_KEY 完全一致
MEDIA_SIGNING_KEY=<至少 32 字符的随机串>
# 可选：媒体 Worker 的域名
# MEDIA_BASE_URL=https://media.mykaoyan.cn
```

## 4. 每个值的来源

| 变量 | 从哪拿 |
| --- | --- |
| `NODE_ENV` / `PORT` | 固定 `production` / `3001` |
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string → **Transaction pooler（6543）**。密码里的特殊字符必须 URL 编码（如 `@` → `%40`）；代码会校验端口 6543 与 `sslmode=verify-full` |
| `DATABASE_CA` | Supabase → Database → SSL Configuration 的 CA 证书；可选，先不填 |
| `BETTER_AUTH_SECRET` | 自己生成，见第 5 节，至少 32 字符 |
| `BETTER_AUTH_URL` | `https://mykaoyan.cn`（前端公开地址，登录走同源 `/api` 代理） |
| `AUTH_TRUSTED_ORIGINS` | `https://mykaoyan.cn`；多个用逗号分隔 |
| `AUTH_COOKIE_DOMAIN` | `mykaoyan.cn`（会话 cookie 放到根域，页面与 API 跨子域共享） |
| `ALIYUN_ACCESS_KEY_ID/SECRET` | 阿里云 RAM 控制台 → 创建 RAM 子账号 → 勾选「OpenAPI 调用访问」；授予号码认证/短信权限（至少 `AliyunDypnsFullAccess`，能收窄到 `SendSmsVerifyCode`/`CheckSmsVerifyCode` 更好） |
| `ALIYUN_SMS_SIGN_NAME` / `TEMPLATE_CODE` | 阿里云短信/号码认证控制台 → 签名管理、模板管理；必须是已审核通过的 |
| `MEDIA_SIGNING_KEY` | 与 Cloudflare 媒体 Worker（`mykaoyan`）的 secret 一致。丢失时重新生成，再同时更新 Worker 控制台与这里 |
| `MEDIA_BASE_URL` | 媒体 Worker 的自定义域名，如 `https://media.mykaoyan.cn`；可选 |

## 5. 生成随机值

Linux / macOS / ECS：

```bash
openssl rand -hex 32       # BETTER_AUTH_SECRET
openssl rand -base64 48    # MEDIA_SIGNING_KEY
```

Windows 11 PowerShell：

```powershell
# BETTER_AUTH_SECRET（64 位 hex）
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })

# MEDIA_SIGNING_KEY（至少 32 字符）
-join ((1..48) | ForEach-Object { [char](Get-Random -Minimum 33 -Maximum 126) })
```

## 6. 校验

```bash
# 权限与归属：应为 -rw------- 你的用户
ls -l /opt/mykaoyan-api/.env

# 变量条数
grep -c '=' /opt/mykaoyan-api/.env

# compose 文件就位后，做一次配置解析（不启动）
cd /opt/mykaoyan-api
docker compose --env-file .env.images -f api-compose.yaml config >/dev/null && echo "compose 配置可解析"
```

容器启动后：

```bash
cd /opt/mykaoyan-api
docker compose --env-file .env.images -f api-compose.yaml ps
docker compose --env-file .env.images -f api-compose.yaml logs --tail=100 api
```

## 7. 常见坑

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| compose 报 `.env` 不存在 | 文件名/目录不对 | 放到 `/opt/mykaoyan-api/.env`，权限 600 |
| API 起不来并提示 `启动配置缺失或无效：DATABASE_URL` | 生产必须配数据库 | 检查 `DATABASE_URL` 是否存在、格式是否正确 |
| 提示 `需要事务连接池与完整 TLS 验证` | 端口不是 6543 或没带 `sslmode=verify-full` | 换成 Supabase Transaction pooler 连接串 |
| 提示 `启动配置缺失或无效：MEDIA_SIGNING_KEY` | 空值或少于 32 字符 | 重新生成并填入 |
| 登录后立刻掉线 | API 与页面不同子域，cookie 未跨域 | 确认 `AUTH_COOKIE_DOMAIN=mykaoyan.cn` 且已部署新版 API |
| 播放令牌验签失败 | 与媒体 Worker 的 `MEDIA_SIGNING_KEY` 不一致 | 两边改成同一个值 |
| 短信发不出 | 签名/模板未审核、RAM 权限不足 | 检查签名与模板状态、RAM 授权 |
| `DATABASE_URL` 密码里有 `@`/`#` 等 | 未 URL 编码 | 做 URL 编码，或改用纯字母数字密码 |
| 部署 workflow 失败 | `.env` 未准备或目录不存在 | 按本文第 2 节创建 |
