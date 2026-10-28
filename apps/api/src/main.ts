import { createApp } from "./app"
import { StartupConfigError } from "./common"
import { readEnvironment } from "./environment"

try {
  const environment = readEnvironment(process.env)
  const app = await createApp(environment)
  await app.listen(environment.PORT, "0.0.0.0")
} catch (error) {
  if (error instanceof StartupConfigError) {
    // 消息只含缺失或无效的键名，不含配置值。
    console.error(error.message)
  } else if (error instanceof Error && "code" in error && error.code === "EADDRINUSE") {
    console.error("启动失败：端口已被占用，请先停止占用该端口的进程。")
  } else {
    console.error("启动失败，请检查运行时配置；配置值不会写入日志。")
  }
  process.exitCode = 1
}
