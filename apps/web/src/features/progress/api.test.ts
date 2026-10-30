import { afterEach, expect, it, vi } from "vitest"

import { PROGRESS_FILE_APP, PROGRESS_FILE_VERSION, progressFileSchema } from "@mykaoyan/core"

import { fetchProgress, fetchRevisions, saveProgress } from "./api"

const document = progressFileSchema.parse({
  app: PROGRESS_FILE_APP,
  version: PROGRESS_FILE_VERSION,
  revision: 1,
  updatedAt: "2026-10-29T00:00:00.000Z",
  updatedBy: "api",
  data: { profile: null, progress: [], mistakes: [], daily: [], dayPlans: [], weekly: [] },
})

const noCounts = { profile: 0, progress: 0, mistakes: 0, daily: 0, dayPlans: 0, weekly: 0 }
const summary = {
  app: PROGRESS_FILE_APP,
  version: PROGRESS_FILE_VERSION,
  etag: '"revision-2"',
  changes: { added: noCounts, updated: noCounts, removed: noCounts },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stub(response: Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    calls.push(init ? { url: input, init } : { url: input })
    return response.clone()
  })
  return calls
}

it("未登录时读进度返回 unauthorized", async () => {
  stub(new Response("{}", { status: 401 }))
  expect(await fetchProgress()).toEqual({ status: "unauthorized" })
})

it("读进度成功时带回文档与 ETag", async () => {
  stub(new Response(JSON.stringify(document), { status: 200, headers: { etag: '"revision-1"' } }))
  expect(await fetchProgress()).toEqual({ status: "ok", document, etag: '"revision-1"' })
})

it("响应缺 ETag 时视为无法识别，不静默接受", async () => {
  stub(new Response(JSON.stringify(document), { status: 200 }))
  const result = await fetchProgress()
  expect(result.status).toBe("error")
})

it("保存遇到 412 时返回冲突，不覆盖云端", async () => {
  stub(new Response(JSON.stringify({ title: "进度文件已在其他位置更新" }), { status: 412 }))
  expect(await saveProgress(document, '"revision-1"')).toEqual({ status: "conflict" })
})

it("保存成功时带 If-Match，并返回摘要与新 ETag", async () => {
  const calls = stub(new Response(JSON.stringify(summary), { status: 200, headers: { etag: '"revision-2"' } }))
  expect(await saveProgress(document, '"revision-1"')).toEqual({ status: "ok", summary, etag: '"revision-2"' })
  expect(calls[0]?.init).toMatchObject({
    method: "PUT",
    headers: { "content-type": "application/json", "if-match": '"revision-1"' },
  })
})

it("保存缺少版本号（428）时带回服务端说明", async () => {
  stub(new Response(JSON.stringify({ title: "缺少 If-Match" }), { status: 428 }))
  expect(await saveProgress(document, '"revision-1"')).toEqual({ status: "error", message: "缺少 If-Match" })
})

it("历史版本列表：未登录、成功与格式错误分开处理", async () => {
  stub(new Response("{}", { status: 401 }))
  expect(await fetchRevisions()).toEqual({ status: "unauthorized" })

  stub(
    new Response(JSON.stringify([{ revision: 2, updatedAt: "2026-10-29T00:00:00.000Z", etag: '"revision-2"' }]), {
      status: 200,
    }),
  )
  expect(await fetchRevisions()).toEqual({
    status: "ok",
    revisions: [{ revision: 2, updatedAt: "2026-10-29T00:00:00.000Z", etag: '"revision-2"' }],
  })

  stub(new Response(JSON.stringify([{ revision: "2" }]), { status: 200 }))
  expect((await fetchRevisions()).status).toBe("error")
})
