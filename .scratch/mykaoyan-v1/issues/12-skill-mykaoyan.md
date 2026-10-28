# 12: skill mykaoyan

**What to build:** 考生把本站的 skill 交给自己的 agent，agent 就能从考生的备考资料生成合法的进度文件、离线校验、再用 Agent 令牌上传。

**Blocked by:** 11（Agent 令牌）

**Status:** ready-for-agent

- [ ] 按 agentskills.io 规范组织，用 skill-creator 检查
- [ ] 包含进度文件说明、零依赖校验脚本、空白模板；校验脚本对公开契约 fixture 的结论与 schema 一致
- [ ] 在一个全新的 agent 会话中，只凭 skill 说明生成一份合法进度文件并上传成功（记录过程）
- [ ] 说明中不出现真实个人数据
