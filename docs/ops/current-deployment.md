# 当前部署（2026-10-29 快照）

> 这是「这台机器上实际跑着什么」，不是目标设计。设计取舍见 [ADR 0012](../adr/0012-frontend-back-on-ecs.md)。
> 本文不写 IP、实例 ID、项目 ref、任何连接串；取值在 ECS 与站主手里。

## 拓扑

```text
浏览器 ──HTTP :8080──▶ Caddy（mykaoyan-edge，宿主机端口）
                        ├── /api/* ──▶ mykaoyan-api:3001（NestJS）
                        │               └── Supabase 东京 ap-northeast-1（事务池 6543）
                        └── 其余   ──▶ mykaoyan-web:3000（TanStack Start SSR）

media.mykaoyan.cn ──▶ Cloudflare 媒体 Worker ──▶ R2（不变）
```

备案通过后：Caddy 改为 80/443 站点 `mykaoyan.cn`，主域加 A 记录指向这台 ECS；8080 临时规则删除。

## 机器与路径

| 项 | 值 |
| --- | --- |
| 地域 / 可用区 | 华南 3（广州）`cn-guangzhou` / `cn-guangzhou-a` |
| 规格 / 系统 | 2C2G / Ubuntu 26.04（内存偏紧，构建时建议有 swap） |
| 源码 | `/opt/mykaoyan-src`（公开仓库 `git clone`，Docker 构建上下文） |
| API 运行配置 | `/opt/mykaoyan-api/.env`（`600`，站主自己写入，**不进仓库**） |
| Supabase 根证书 | `/opt/mykaoyan-api/supabase-ca.crt`（`Supabase Root 2021 CA`，见下） |
| 反代配置 | `/opt/mykaoyan-edge/Caddyfile` |
| 镜像 | `mykaoyan-web:local`、`mykaoyan-api:local`（均由 `deploy/Dockerfile` 构建） |

## 容器

| 容器 | 网络 | 端口 | 启动要点 |
| --- | --- | --- | --- |
| `mykaoyan-edge` | `mykaoyan` | `0.0.0.0:8080→8080` | 挂 `/opt/mykaoyan-edge/Caddyfile`；`:8080` 站点按路径分流 |
| `mykaoyan-web` | `mykaoyan` | 3000（仅内网） | `NODE_ENV=production HOST=0.0.0.0 PORT=3000` |
| `mykaoyan-api` | `mykaoyan` | 3001（仅内网） | `--env-file /opt/mykaoyan-api/.env`；挂根证书并设 `NODE_EXTRA_CA_CERTS` |

全部 `--restart unless-stopped`，宿主机重启后自动拉起。

## 常用操作

```bash
# 重建镜像（源码有更新后）
cd /opt/mykaoyan-src && git pull
docker build -f deploy/Dockerfile --target web -t mykaoyan-web:local .
docker build -f deploy/Dockerfile --target api -t mykaoyan-api:local .

# 重启某个容器
docker rm -f mykaoyan-api
docker run -d --name mykaoyan-api --restart unless-stopped --network mykaoyan \
  --env-file /opt/mykaoyan-api/.env \
  -e NODE_EXTRA_CA_CERTS=/certs/supabase-ca.crt \
  -v /opt/mykaoyan-api/supabase-ca.crt:/certs/supabase-ca.crt:ro \
  mykaoyan-api:local

# 跑迁移（用 5432 Session pooler，事务池不支持 DDL）
docker run --rm --env-file /opt/mykaoyan-api/.env \
  -v /opt/mykaoyan-src/packages/db/supabase/migrations:/m:ro \
  postgres:17-alpine sh -c '
u=$(printf "%s" "$MIGRATION_DATABASE_URL" | sed "s/sslmode=verify-full/sslmode=require/")
for f in /m/*.sql; do echo "== $(basename "$f")"; psql "$u" -v ON_ERROR_STOP=1 -q -f "$f" || exit 1; done'

# 日志
docker logs --tail 50 mykaoyan-api
```

免 SSH 时可用阿里云云助手（`aliyun ecs RunCommand`，RAM 需 `ecs:RunCommand`）；命令内容建议 base64 编码后传，避免引号转义。

## 验证基线（2026-10-29 实测）

```text
GET /api/health              → 200 {"status":"ok","database":"connected"}
GET /api/courses?subject=408 → 200 []
GET /api/handouts?subject=302→ 200 []
GET /api/v1/progress         → 401（未登录，符合预期）
GET /                        → 200
GET /login                   → 200
```

## 本次踩到的坑（待并入 docs/pitfalls.md）

并行会话正在改 `docs/pitfalls.md`，本次不直接改它，先记在这里；收尾后按 `mk/DEPLOY-NN` 并入。

1. **mk/DEPLOY-02 未备案域名按 Host 头拦截，与端口无关。** 域名解析到未备案的阿里云 ECS 后，任何端口的 HTTP 请求都会被返回 403＋`www.aliyun.com/beian/beian-block` 页。判定方式：同一台机器用纯 IP 访问 200、用域名访问 403、纯 IP 但伪造 `Host` 头又变 403。结论：备案通过前不要给主域加解析。
2. **mk/DEPLOY-03 Supabase pooler 用自签根 CA。** 链路是 `Supabase Root 2021 CA`（自签）→ `Supabase Intermediate 2021 CA` → `*.pooler.supabase.com`。psql 在 `verify-full` 下报 `root certificate file does not exist`，Node 驱动报 `self-signed certificate in certificate chain`。解法：把根证书下载/固定后给 psql `sslrootcert=`、给 Node `NODE_EXTRA_CA_CERTS`。
3. **mk/DEPLOY-04 6543 与 5432 不能混，地域 host 也不能混。** 运行时用事务池 6543，迁移用 Session pooler 5432；两条串的 `aws-0-<region>` 必须同属项目所在地域，否则报 `tenant/user ... not found`（实测：6543 写东京、5432 写成新加坡就失败）。
4. **mk/DEPLOY-05 多出口 NAT 让 IP 白名单失效。** 同一分钟内 `checkip.amazonaws.com` 与 `ipinfo.io` 看到的出口 IP 不同，安全组 `/32` 规则时通时不通。预览期要么放行特定网段，要么明确接受全网放行后再收紧。
5. **mk/DEPLOY-06 Cloudflare Worker Custom Domain 依赖 zone active。** zone 里记录齐全但 NS 在阿里云时，主域不解析；`dig @<cloudflare-ns>` 能读到记录只是「配置存在」，不代表对外生效。
6. **mk/DEPLOY-07 生产模式强制短信走阿里云。** `NODE_ENV=production` 时 `SMS_PROVIDER` 必须是 `aliyun` 且 Dypnsapi 凭据齐全，否则启动即失败；没有资质时只能用 `development` + `memory`，而 `memory` 验证码没有任何读取入口，登录走不通。
7. **psql 连 Supabase 的 TLS 细节。** 容器里缺 CA 时 `sslrootcert=system` 也可能失败（alpine 需 `apk add ca-certificates`，国内网络常装不上）；可直接把宿主机 `/etc/ssl/certs/ca-certificates.crt` 挂进容器用 `sslrootcert=`，或用 `sslmode=require` 做一次性迁移（本次迁移即如此，运行时仍是 verify-full）。

## 未完成

| 项 | 阻塞原因 | 下一步 |
| --- | --- | --- |
| 主域可访问 | 备案管局审核中 | 通过后加 A 记录、放行 80/443、Caddy 签证书 |
| 登录 | 缺阿里云号码认证凭据与已审核签名/模板 | 申请后补 `ALIYUN_*` 并把 `NODE_ENV` 切 `production` |
| 课程/讲义有内容 | 表里没有数据，内容不进仓库 | 管理端上架（需要先有管理员账号，而管理员登录同样依赖短信） |
| 内存 | 2C2G 同时跑 web+api+构建 | 构建期加 swap；长期升 2C4G |
