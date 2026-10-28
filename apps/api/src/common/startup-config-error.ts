/**
 * 启动配置缺失或无效。消息只列键名，不包含配置值。
 *
 * 各领域的配置解析统一抛这个错误，启动入口据此打印可操作的原因，而不是一句笼统的
 * 「请检查运行时配置」。参考 `environment` 与 `auth/environment`。
 */
export class StartupConfigError extends Error {}
