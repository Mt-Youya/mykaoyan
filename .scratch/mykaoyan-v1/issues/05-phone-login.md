# 05: 手机号验证码登录

**What to build:** 考生输入手机号、收到短信验证码后登录，第一次登录即注册；注册时单独勾选同意个人信息存储在新加坡；可以退出当前设备或所有设备。

**Blocked by:** 02（Hello 全链路上线）、03（数据库迁移管线与备份）

**Status:** ready-for-human（本地完成；真实短信、真机与 SSR 端到端待环境）

- [x] Better Auth 接入 NestJS（先验证社区集成可用，不可用时直接挂载 handler，并在交付报告说明）
- [ ] 验证码由阿里云号码认证发送与校验；短信模板、生成、前端输入框、服务端校验四处的位数一致，有测试
- [x] 同一手机号的发送频率受限，超限时提示还要等多久；验证码错误与过期给出准确提示，并能重新获取
- [x] 注册页单独的出境同意勾选，未勾选不能注册；记录同意时间与政策版本
- [x] 个人信息保护影响评估（《个人信息保护法》第五十五条）写成文档存档，覆盖出境到新加坡的手机号
- [ ] 服务端渲染时会话刷新后的 `Set-Cookie` 正确转回浏览器，有测试
- [x] 退出默认只结束当前设备；「退出所有设备」单独提供
- [ ] 未登录调用学习数据接口返回 401（守卫与测试已就绪，具体学习数据接口属工单 10）；手机号在日志中脱敏（已实现）
- [ ] 真机实测：收码、登录、退出、会话过期后刷新

## 本轮交付说明

- 接入方式：`better-auth@1.7.14`，由 `AuthController` 直接挂 `auth.handler(Request)`；官方文档里的 NestJS 集成是社区维护包（要求全局关掉 body parser 并接管全局守卫），未采用。手机号验证码用官方 `phoneNumber` 插件，`verification.storeInDatabase: false`，OTP 不落库、手机号不进 verification 表。
- 表：`packages/db/src/accounts/index.ts` 六张（accounts/sessions/login_methods/verification_tokens/phone_login_attempts/personal_info_transfer_consents），全部启用 RLS；迁移 `20261027052409_square_venom.sql` 已含 6 条 `REVOKE`。
- 短信：`apps/api/src/auth/sms-aliyun.ts` 按阿里云号码认证 `SendSmsVerifyCode`/`CheckSmsVerifyCode` 实现（HMAC-SHA1 RPC 签名）；位数、有效期、政策版本单一来源 `policy.ts`，前端从 `GET /api/phone/policy` 读取。
- 频率与提示：60 秒冷却 + 24 小时 10 条上限，429 带 `Retry-After`；错误与过期分别提示，可重新获取。
- 出境同意：前端单独勾选、未勾选按钮禁用；服务端 `CONSENT_REQUIRED` 双保险；同意时间与政策版本写入同意表，同版本重复同意幂等。
- 影响评估：`docs/privacy/pipia-phone-transfer.md`（草案，待站主确认）。
- 退出：`POST /api/phone/sign-out` 只结束当前会话，`POST /api/phone/sign-out-all` 撤销全部；真实库测试覆盖「另一设备仍有效」。
- 测试：`apps/api/src/auth/` 7 个文件 + `apps/api/src/auth.test.ts`（真实 Postgres）共 43 项通过；`SessionGuard` 401 与 `maskPhone` 有测试。
- 守卫现状：`SessionGuard` 只挂在 `/api/admin/*` 上；学习数据接口在工单 10，届时挂同一守卫。
- 未完成：真实阿里云外呼与真机收码、浏览器 SSR 会话刷新端到端、真机会话过期后刷新。会话刷新本身在 Better Auth 实例与 Nest 层已测，浏览器两进程链路未实测。
