import { spawnSync } from "node:child_process"

import { expect, it } from "vitest"

it.each(["NODE_ENV", "HOST", "PORT"])("前端启动拒绝缺失或空串 %s，且不打印配置值", (key) => {
  for (const value of key === "HOST" ? [undefined, ""] : [undefined, "", "DO_NOT_ECHO"]) {
    const env = { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: "3000", [key]: value }
    const result = spawnSync(process.execPath, ["scripts/start.mjs"], { env, encoding: "utf8", timeout: 2000 })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`启动配置无效：${key}`)
    expect(result.stderr).not.toContain("DO_NOT_ECHO")
  }
})
