# 3 · 数据库与迁移

> 生产库没有迁移历史表、pooler 要自签 CA、drizzle 不生成 REVOKE、Windows 的 psql 还有编码坑；这一章收数据库层反复出现的几个硬点。

### DB-01 · 原生 SQL 的 timestamptz 返回字符串，发布接口 500

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27（dsh--session-3e13f3f8…md 第 17283–17314、17471–17479 行）

**1. 怎么出现的**
讲义发布接口报 `TypeError: saved.updated_at.toISOString is not a function`（`apps/api/src/publishing/service.ts:216`），同一 bug 让集成测试出现 `expected 500 to be 400`、`expected 500 to be 200`。测试先告警，随后才定位到发布时间。

**2. 怎么诊断的**
用临时脚本直连临时库调用 `publishHandout`，拿到完整栈；确认 `DatabaseService.client` 是 postgres.js 裸连接，`timestamptz` 没配 parser 时返回 `string`。第一次改返回处时又撞上编辑版本守卫（`file changed since it was read`），重读文件后才成功。

**3. 提了什么方案**
映射层同时接受 `Date | string` 并统一转 ISO（采用）；在连接层配置 postgres.js 的 `timestamptz` parser（影响面大、需回归所有查询，未采用）。

**4. 最后怎么处理的**
调试脚本输出 `updatedAt` 为 ISO 字符串，handout 测试 4/4 通过。`docs/pitfalls.md` 的 `mk/DB-03` 已记录同一原理，这里补的是真实报错形态与“改之前先重读文件”。


**2026-10-31 增量**  会员接口再次复现 timestamptz 字符串（`p.startsAt.toISOString is not a function`），并补反向形态：JS `Date` 直接进 postgres 模板报 Buffer/Date TypeError。

- 📎 增量证据: [evidence.gz](./evidence.gz) → DB-01
- 📎 excerpt: [evidence.gz](./evidence.gz) → DB-01

### DB-02 · 生产库落后 8 个迁移，而且没有迁移历史表

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27（dsh--session-3e13f3f8…md 第 10521–10538、10540–10600、10642–10654 行）

**1. 怎么出现的**
用根 `.env` 连生产库探测时 `DB OK: postgres` 紧接着 `FAIL: relation "agent_tokens" does not exist`；表清单只有 13 张，仓库有 13 个迁移，生产只应用了前 5 个；`supabase_migrations` schema 不存在，无法用 Supabase CLI 列迁移。

**2. 怎么诊断的**
先用 Supabase Root 2021 CA 建 verify-full 连接（见 DB-03），再查 `information_schema.tables` 与迁移历史 schema 确认落后 8 个；对每个待应用迁移用 `Select-String -Pattern 'DROP|DELETE|TRUNCATE|UPDATE |INSERT '` 检查破坏性语句，确认全部是新增表/列/约束后，用 node `postgres` 逐文件按 `--> statement-breakpoint` 重放。

**3. 提了什么方案**
正规 `supabase migration list`（本机无 CLI/凭据链，否）；绕开缺表只发课程（发布令牌等表必需，否）；直连生产逐条补迁移（采用，高风险但受控）；从头重放全部 13 个（前 5 个会冲突，否）。

**4. 最后怎么处理的**
8 个迁移全部 `applied`，public 22 张表，health `{"status":"ok","database":"connected"}`。生产迁移必须可审计：这次只是“先查破坏性语句 + 记表数”，更稳的是补迁移历史表。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DB-02

### DB-03 · Supabase pooler：自签 Root 2021 CA，且必须先发 PostgreSQL SSLRequest 再升级 TLS

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh session-3e13f3f8-c07f-4994-986a-bf61291eeb27（dsh--session-3e13f3f8…md 第 10140–10163、10505–10526 行）

**1. 怎么出现的**
`DB FAIL: self-signed certificate in certificate chain`（pooler 6543，sslmode=verify-full）；换脚本直接 `tls.connect` 到 6543 又报 `wrong version number`——pooler 端口说 PostgreSQL 协议，不是裸 TLS。

**2. 怎么诊断的**
先确认 Supabase Root 2021 CA 自签链；直接 TLS 握手失败后，先向 6543 发 8 字节 PostgreSQL `SSLRequest`（`00 00 00 08 04 d2 16 2f`），收到 `S` 后 `tls.connect({socket,...})` 升级，遍历 chain 取出 `selfSigned=true` 的 Root 2021 CA，写入临时 pem，再用 `postgres(url,{ssl:{ca,rejectUnauthorized:true}})` 连接成功。

**3. 提了什么方案**
`sslmode=require` 降级（旧一次性方案，本轮否）；`NODE_EXTRA_CA_CERTS`（本地 API 启动采用）；固定 CA 文件显式传 ca（探测脚本采用）。

**4. 最后怎么处理的**
链路 `*.pooler.supabase.com → Supabase Intermediate 2021 CA → Supabase Root 2021 CA`，`DB OK: postgres`，本地 API health 200。pooler 不能当裸 TLS 端口用。


**2026-10-31 增量**  psql 与容器侧补充：`sslrootcert=system`、挂宿主 CA 都不够；必须 `openssl s_client -starttls postgres` 取三段链；东京与新加坡根指纹一致后落盘；运行时 `NODE_EXTRA_CA_CERTS` + `verify-full`，迁移阶段临时 `sslmode=require` 并在报告披露。

- 📎 增量证据: [evidence.gz](./evidence.gz) → DB-03
- 📎 excerpt: [evidence.gz](./evidence.gz) → DB-03

### DB-04 · drizzle-kit 生成的迁移不含 REVOKE，新表默认对 PUBLIC 开放

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` dsh 6d56461f-a76c-4d68-a5c8-f585666ec968、dsh 7a61d060-c547-4b14-8cf4-d637aaa30195（第 5106–5166、5333–5355 行；第 10745–10757 行）

**1. 怎么出现的**
`drizzle-kit generate` 产出的迁移里只有 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`，全文没有 `REVOKE`。新表默认权限仍对 `PUBLIC/anon/authenticated` 开放，只靠 RLS 不满足“服务端独占访问”的设计。

**2. 怎么诊断的**
仓库既有注释已写明“drizzle-kit 不生成 REVOKE，需要手写”；本次生成 3 张新表后按要求在迁移尾部追加 `REVOKE ALL ON TABLE ... FROM PUBLIC,anon,authenticated;`，再跑一次 `generate` 验证幂等（`No schema changes`）。迁移测试里补了 RLS/权限断言。

**3. 提了什么方案**
改 drizzle-kit/插件自动生成（上游无能力）；迁移尾部手写（采用，必须与 ENABLE RLS 同文件）；只依赖 RLS（否）。手写易漏，必须配断言。

**4. 最后怎么处理的**
空库重放 16/16 通过，包含“字幕、试卷评论与删除审计启用 RLS 且公开角色无权限”等断言。生成器只负责 schema 差异，安全语句要人补。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DB-04

### DB-05 · Windows 临时库的 psql：中文参数报 invalid byte sequence；DROP DATABASE 混在事务里失败留脏库

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh 7a61d060-c547-4b14-8cf4-d637aaa30195（dsh--7a61d060…md 第 10048–10100、10672–10724 行）

**1. 怎么出现的**
第一次用本机 PG18 临时集群跑全量：db 迁移测试 4 项失败，报 `ERROR: invalid byte sequence for encoding "UTF8": 0xb7`、`0xd0 0xe9`、`0xd6 0xd0`（含中文 INSERT 的用例）。另一次清理临时库用一条 `psql -c "drop role …; drop database …"`，报 `ERROR: DROP DATABASE cannot run inside a transaction block`，库与角色残留，随后迁移测试报 `relation "paper_comments" does not exist`。

**2. 怎么诊断的**
先试 `PGCLIENTENCODING=UTF8` 仍失败；用最小用例 `PGCLIENTENCODING=GBK; psql -c "select '中文测试'"` 成功（控制台显示乱码但服务端接受）；清理时改为每条语句单独 `-c`，先 `dropdb --force` 再 `createdb`，用 `select count(*) from pg_tables where schemaname='public'` 确认 0 张表后重跑。

**3. 提了什么方案**
把测试断言改成 ASCII（会失去中文字节/字符上限覆盖，否）；迁移测试改从文件/STDIN 传 SQL（改测试框架，否）；`PGCLIENTENCODING=GBK`（采用，CI Linux 默认 UTF-8 不受影响）+ 逐条清理（采用）。

**4. 最后怎么处理的**
`PGCLIENTENCODING=GBK` 下 migrations 16/16 通过，含中文正文限制与字节一致性断言。临时库操作要用真正的 drop/create 工具，别把多条语句塞进一个 `-c`。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DB-05

### DB-06 · reviewer 外键与「已审核必有审核人」check 冲突

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh 6d56461f-a76c-4d68-a5c8-f585666ec968（dsh--6d56461f…md 第 5140–5162、7560–7587 行）

**1. 怎么出现的**
生成的迁移同时有 `papers.reviewer_id REFERENCES accounts(id) ON DELETE SET NULL` 和 check「approved/rejected 时 reviewer_id 必须非空」。删除审核人账号时外键会把 reviewer 置空，check 立刻违例，删除失败。会话把它写进“残留风险”，没有当场改。

**2. 怎么诊断的**
设计时把“审核人”当审计字段，又想保留账号外键；检查约束要求通过/驳回必须有审核人，而 `ON DELETE SET NULL` 与它互斥。后续仓库提交 `9339e8a fix(db): keep paper reviewer id as audit value without FK` 去掉外键、保留 uuid 审计值。

**3. 提了什么方案**
`ON DELETE SET NULL` + 放宽 check（失去“已审核必有审核人”保证，否）；`ON DELETE RESTRICT`（账号永远删不掉，否）；去掉外键保留审计值（后续采用），牺牲引用完整性换审计解耦。

**4. 最后怎么处理的**
改完后迁移测试 16/16；但“删审核人账号”这条用例没有补测试。审计字段的生命周期与账号生命周期不一致时，外键可能是错的建模。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DB-06

### DB-07 · pg_restore 到空库先撞 `schema "public" already exists`；重建 public 后又因 PUBLIC 权限未重放，业务角色读表 500

`batch` 2026-10-31 · `severity` high · `status` resolved · `source` codex 01a17774-3a23-78d1-b0bc-dfa1c4dd1cae（codex--01a17774-3a23-78d1…md 第 898–912、920–940、1002–1018、1587–1603、1611–1635 行）

**1. 怎么出现的**
备份恢复测试一上来就红：`pg_restore --exit-on-error --no-owner` 在空库上执行 `CREATE SCHEMA public;`，报 `ERROR: schema "public" already exists`。补 `--clean --if-exists` 后第二轮继续推进，又在 `src/backup.test.mjs:86:25` 报 `PostgresError: permission denied for schema public`——那一行的前一句刚 `set local role service_role` 去读 `public.backup_probe`。

**2. 怎么诊断的**
先按报错定位到“目标库不是空白 schema”的假设，强化空库判定（统计非系统 schema 里的 `pg_class`/`pg_proc`/`pg_type`），再加 `--clean --if-exists --no-owner`。第二轮失败后对比正常库与恢复库：恢复时 `public` schema 被重建，但默认 PUBLIC 的 USAGE 权限没有被 pg_restore 重放，`service_role` 连 schema 都进不去。

**3. 提了什么方案**
备份清单里同时记录 `pg_roles`（含 ACL 引用的角色）和 schema ACL（`aclexplode` 读 `publicPrivileges`），恢复后 `revoke all on schema ... from public` 再按清单重授（采用）；恢复后手工执行 SQL 把权限写死（否，不可重复）；接受恢复库权限不同（否，会掩盖真实 ACL 漂移）。

**4. 最后怎么处理的**
`backup.test.mjs` 3/3 通过，逐表行数、表权限与 `public`/`supabase_migrations` 的默认权限都做了往返比对并补齐 ACL 引用的角色。验证范围仅本机临时 Postgres 15（CI 是 PG 17），本会话没有真正触发 GitHub Actions。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DB-07

### DB-08 · 两条 Supabase 连接串 project ref 相同但 pooler 地域不同：自检只比 ref 就报「一致」

`batch` 2026-10-31 · `severity` medium · `status` resolved · `source` dsh session-1461740f-95ff-42cf-bf42-4e2c42a6d1d1（dsh--session-1461740f-9…md 第 7962–7998、8004–8024、8135–8157、8161–8175 行）

**1. 怎么出现的**
项目实际创建在东京，但 `MIGRATION_DATABASE_URL` 是从别处拷来的新加坡 pooler 地址；两条串 project ref 相同、host 不同。应用启动体检只看能否拿到配置，真正跑迁移时 5432 直接 `FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found`。

**2. 怎么诊断的**
`.env` 结构检查已经打出两个 host 分别在东京与新加坡；但同一脚本的“一致性”判定只比较 `postgres.<ref>` 里的 ref，输出“refs 一致: True”，加上两个 host 的 5432 都通，自检给人“连接串没问题”的假象。随后用 `postgres:17-alpine` 分别 `psql -tAc "select 1"`：6543 返回 1、5432 报 tenant/user not found，才看清是地域混用。

**3. 提了什么方案**
只改 hostname（新加坡 → 东京）、不动用户名密码（采用）；迁移继续用 `MIGRATION_DATABASE_URL`；自检增加“同一 ref 必须落在同一 pooler 地域”的断言（未补，仍是空白）。

**4. 最后怎么处理的**
改完 host 后 5 个迁移全部应用成功；运行时 6543 + `verify-full` 配合固定根证书后 `/api/health` 返回 `{"status":"ok","database":"connected"}`。一致性检查至少要比 ref、地域 host、端口用途三样。

- 📎 excerpt: [evidence.gz](./evidence.gz) → DB-08
