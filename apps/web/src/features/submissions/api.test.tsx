import { afterEach, describe, expect, it, vi } from "vitest"

import type { SubmissionInput } from "@mykaoyan/core"

import { submissionRequest, uploadSubmission } from "./api"
afterEach(() => vi.unstubAllGlobals())
describe("投稿请求与续传", () => {
  it("只发送缺失分片，重新读取服务器进度，直传请求不发到API", async () => {
    const requests: string[] = [],
      direct: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requests.push(url)
        const body = url.endsWith("/uploads")
          ? { status: "uploading" }
          : url.endsWith("/upload")
            ? { completed: false, parts: [{ number: 1, size: 8388608 }] }
            : url.endsWith("/parts/2")
              ? { url: "https://r2.example.invalid/part-2" }
              : { status: "pending" }
        return new Response(JSON.stringify(body))
      }),
    )
    class FakeXHR {
      status = 200
      upload = { onprogress: null }
      onload: () => void = () => {}
      open(_method: string, url: string) {
        direct.push(url)
      }
      send(blob: Blob) {
        expect(blob.size).toBe(3)
        this.onload()
      }
      abort() {}
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR)
    const file = new File([new Uint8Array(8388611)], "fictional.mp4"),
      signal = new AbortController().signal
    const result = await uploadSubmission(file, { id: "fictional-upload" } as SubmissionInput, signal, () => {})
    expect(result.status).toBe("pending")
    expect(requests).not.toContain("/api/submissions/fictional-upload/parts/1")
    expect(requests).toContain("/api/submissions/fictional-upload/complete")
    expect(direct).toEqual(["https://r2.example.invalid/part-2"])
  })
  it("403保留给会员入口处理，网络错误不自动重发", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: "投稿需要有效会员" }), { status: 403 })),
    )
    await expect(submissionRequest("submissions/uploads", "POST", {})).rejects.toMatchObject({
      status: 403,
      message: "投稿需要有效会员",
    })
    const fetch = vi.fn().mockRejectedValue(new Error("offline"))
    vi.stubGlobal("fetch", fetch)
    await expect(submissionRequest("submissions/uploads", "POST", {})).rejects.toThrow("结果可能未确认")
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
