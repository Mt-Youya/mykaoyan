const origin = new URL(process.argv[2])
if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password) {
  throw new Error("冒烟检查只接受不含凭据的 HTTP(S) 地址")
}

try {
  await Promise.all(
    ["/", "/api/health"].map(async (path) => {
      const response = await fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(10000) })
      if (response.status !== 200) throw new Error(`${path} 未返回 200`)
      if (path === "/api/health") {
        const data = await response.json()
        if (data.status !== "ok" || data.database !== "connected") throw new Error("健康检查未确认数据库连通")
      }
      console.log(`${path} 检查通过`)
    })
  )
} catch {
  console.error("冒烟检查失败，请检查站点、接口与数据库连接。")
  process.exitCode = 1
}
