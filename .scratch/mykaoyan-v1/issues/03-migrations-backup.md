# 03: 数据库迁移管线与备份

**What to build:** 表结构变更有一条可靠的路径：本地写迁移，CI 从空库重放，再依次推到 dev 和 prod；生产数据每天自动备份，并且恢复过一次。

**Blocked by:** 01（仓库卫生与 monorepo 骨架）

**Status:** ready-for-human（仅本地部分；外部验收待环境）

- [x] Drizzle 生成纯 SQL 迁移；第一份迁移包含一张最小表，并对 `anon`、`authenticated` 角色开启 RLS 且拒绝访问
- [ ] CI 用临时 Postgres 从空库跑全部迁移，失败即红
- [ ] 推送迁移前用 `supabase migration list` 核对 dev、prod 状态，流程写进 PLAN §6
- [x] 每个新建函数显式撤销 PUBLIC 执行权限，有基于 `pg_proc` 的断言测试
- [ ] 每天把 prod 的 `pg_dump` 存到 R2 私有桶，保留 30 天
- [ ] 完成一次从备份恢复到临时库的演练，记录耗时与校验结果（表行数逐表比对）
- [ ] 上线前的保活：每天访问一次健康检查，防止免费版因 7 天无访问而暂停

## 本轮交付说明

本地实现与分层验证见 [M0 本地交付报告](../../../docs/delivery/m0-local.md)。未勾选项包含真实云资源、CI 或网络验收；本机替身与临时数据库测试不能替代这些证据。流程已实现，实际 dev/prod 核对待环境。本轮仅作本地提交，未 push 或部署。
