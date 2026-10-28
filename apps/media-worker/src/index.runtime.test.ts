import { createTestHarness } from "wrangler"
import { expect, it } from "vitest"
import { key, secret, token } from "./fixtures/token"

it("workerd 与本地 R2 能实际处理完整播放、拖动区间、304 和无效令牌", async () => {
  const server = createTestHarness({
    workers: [{ configPath: "wrangler.jsonc", secrets: { MEDIA_SIGNING_KEY: secret } }],
  })
  try {
    await server.listen()
    const worker = server.getWorker<Env>()
    const env = await worker.getEnv()
    await env.BUCKET.put(key, "0123456789", { httpMetadata: { contentType: "video/mp4" } })
    const path = "/" + key + "?token=" + token()
    const full = await worker.fetch(path)
    expect(full.status).toBe(200)
    expect(full.headers.get("cache-control")).toBe("private, no-store")
    expect(await full.text()).toBe("0123456789")
    const range = await worker.fetch(path, { headers: { Range: "bytes=2-4" } })
    expect(range.status).toBe(206)
    expect(range.headers.get("content-range")).toBe("bytes 2-4/10")
    expect(await range.text()).toBe("234")
    expect((await worker.fetch(path, { headers: { "If-None-Match": full.headers.get("etag")! } })).status).toBe(304)
    expect((await worker.fetch("/" + key + "?token=invalid")).status).toBe(401)
  } finally {
    await server.close()
  }
}, 20000)
