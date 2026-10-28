# 阿里云 skill 清单（本项目实际会用到的）

本机 `~/.agents/skills` 下装有 300+ 个阿里云官方 `alibabacloud-*` skill。本文只登记 mykaoyan 会用到的那些，**不要因为目录里有就默认启用**；先读对应 `SKILL.md` 再动手（规则见 [AGENTS.md](../../AGENTS.md)）。

## 先说结论

- 绝大多数阿里云 skill 依赖 `aliyun` CLI（≥ 3.3.3）和 RAM 子账号 AK。**本机当前没有安装 `aliyun`，也没有 `~/.aliyun/config.json`**，所以这些 skill 是「已安装、未就绪」。
- 阿里云账号只承担三件事：**ICP 备案、DNS、广州 ECS 与云监控**。数据库（Supabase 新加坡）和视频（R2）不在阿里云。
- 涉及创建、修改、删除云资源，或任何产生费用的操作，都要站主本轮明确授权（[PLAN.md §2](../PLAN.md)）。

## 使用前准备

1. 安装 `aliyun` CLI ≥ 3.3.3，用 `aliyun version` 核对；然后 `aliyun configure set --auto-plugin-install true` 与 `aliyun plugin update` 装齐插件。
2. 建 RAM 子账号，只授予当前任务需要的最小权限；AK 只写本机配置，**不进仓库、不贴聊天**。
3. `aliyun configure` 交互输入凭据；只读任务不要跑会写资源的命令。
4. `alibabacloud-domain` 额外要求 DomainCLI 插件 ≥ 0.9.8（`aliyun domain version` 可读出版本号）。

## 本项目会用到的 skill

| 场景 | skill | 用途 | 前置 |
| --- | --- | --- | --- |
| CLI 基座 | `alibabacloud-cli-guidance` | 安装、认证、插件、命令构造、报错排查 | `aliyun` CLI |
| 域名与 ICP 备案 | `alibabacloud-domain` | `aliyun domain`：域名、解析、备案入口与状态 | DomainCLI ≥ 0.9.8 |
| 备案信息核验 | `alibabacloud-icpba-sucessdata-query` | 备案通过后核验主体、网站信息与风险提示 | 备案已通过 |
| DNS 解析诊断 | `alibabacloud-dns-resolve-diagnose-customer` | NXDOMAIN、记录不生效、全国探测；切 NS 后验证 | `aliyun` CLI |
| ECS 故障诊断 | `alibabacloud-ecs-diagnose` | SSH 超时、磁盘满、CPU/内存告警、实例异常 | 云助手可用 |
| ECS 健康巡检 | `alibabacloud-ecs-health-inspection` | CPU、负载、内存、磁盘 IO、网络容量报告 | `aliyun` CLI |
| ECS 公网访问排查 | `alibabacloud-ecs-vpc-publicnetwork-troubleshoot` | 安全组、EIP、NAT；备案后放行 80/443 时用 | `aliyun` CLI |
| 云监控告警规则 | `alibabacloud-cms-alert-rule-create` | 建 CPU、内存、磁盘 > 80% 告警（[PLAN.md §7](../PLAN.md) 要求） | CMS 权限 |
| 云监控入口 | `alibabacloud-cms-manage` | `aliyun cms2` 命令族 | `aliyun` CLI |
| RAM 权限排查 | `alibabacloud-ram-permission-diagnose` | 遇到 403、NoPermission、Forbidden 时用 | `aliyun` CLI |
| 证书诊断 | `alibabacloud-tls-cert-diagnosis` | 证书链、域名匹配、有效期检查 | 不需要云权限 |
| 多地区可用性探测 | `alibabacloud-website-probe` | 备案后做国内多运营商 HTTP/Ping/DNS 探测 | 公开探测平台 |
| 操作审计 | `alibabacloud-actiontrail-diagnosis` | 查谁在何时改了哪个云资源 | ActionTrail 权限 |
| 阿里云 MCP / Agent Toolkit | `alibabacloud-mcp-connector`、`alibabacloud-agent-toolkit-install` | 需要 MCP 形态接入时再启用；本地 CLI 路径不需要 | — |

## 本项目不用的

ACK/Kubernetes、PAI、Flink、MaxCompute、DataWorks、RDS/PolarDB/Tair、OSS、WAF/DDoS、CDN、SLS（初期）、视频与数字人、IDaaS、FinOps 等。本站不用阿里云数据库、对象存储或大数据产品，相关 skill 只在特殊排障时临时加载。

两条容易混用的：

- `alibabacloud-sms-send-short-message` 是**短信服务（dysms）**；本站登录用的是**号码认证（Dypnsapi）** 的 `SendSmsVerifyCode` / `CheckSmsVerifyCode`，两者不是同一产品（见 [ADR 0004](../adr/0004-phone-first-login.md)），联调时不要混用。
- `alibabacloud-ecs-code-deploy` 用 AppManager 往 ECS 推代码；本站部署固定走 GitHub Actions → ACR → `docker compose`（[ADR 0010](../adr/0010-worker-api-proxy.md)），不采用这条路径，只留作排障参考。

## 与项目文档的对应

- 域名、子域归属与备案顺序：`docs/PLAN.md` §6、[deploy-api runbook](../ops/deploy-api-runbook.md) §8
- ECS 规格、备份、告警：`docs/PLAN.md` §7
- 不提交密钥与云资源标识：`docs/PLAN.md` §2
