const origin = new URL(process.argv[2])
if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password) {
  throw new Error("冒烟检查只接受不含凭据的 HTTP(S) 地址")
}

try {
  const response = await fetch(new URL("/api/health", origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  })
  if (response.status !== 200) throw new Error(`/api/health 未返回 200（实际 ${response.status}）`)
  const data = await response.json()
  if (data.status !== "ok" || data.database !== "connected") throw new Error("健康检查未确认数据库连通")
  console.log(`/api/health 检查通过（${origin.origin}）`)
} catch (error) {
  console.error("API 冒烟检查失败，请检查 DNS、TLS、容器与数据库连接。")
  if (error instanceof Error) console.error(error.message)
  process.exitCode = 1
}
