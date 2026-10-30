import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { resolve as resolvePath } from "node:path"

import { expect, it } from "vitest"

it.each([
  [200, "connected", 0],
  [503, "connected", 1],
  [200, "unavailable", 1],
])("首页状态 %s、数据库 %s 时退出码为 %s", async (homeStatus, database, expected) => {
  const server = createServer((request, response) => {
    response.statusCode = request.url === "/" ? homeStatus : 200
    response.end(request.url === "/" ? "Hello" : JSON.stringify({ status: "ok", database }))
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const origin = `http://127.0.0.1:${server.address().port}`
    const process = spawn(globalThis.process.execPath, [resolvePath("deploy/smoke.mjs"), origin], { stdio: "ignore" })
    const code = await new Promise((resolve, reject) => {
      process.once("error", reject)
      process.once("exit", resolve)
    })
    expect(code).toBe(expected)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
