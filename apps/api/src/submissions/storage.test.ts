import { describe, expect, it } from "vitest"

import { readEnvironment } from "../environment"
import { R2SubmissionStorage } from "./storage"
describe("R2分片预签名边界", () => {
  it("签名绑定上传编号、分片编号、大小且不暴露密钥", async () => {
    const config = readEnvironment({
      NODE_ENV: "test",
      PORT: "3001",
      MEDIA_SIGNING_KEY: "fictional-signing-key-32-characters",
      R2_ACCOUNT_ID: "a".repeat(32),
      R2_ACCESS_KEY_ID: "fictional-access",
      R2_SECRET_ACCESS_KEY: "fictional-secret",
      R2_BUCKET: "fictional-bucket",
      R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
    })
    const url = await new R2SubmissionStorage(config).sign(
      "submissions/fictional/video.mp4",
      "fictional-upload",
      2,
      123,
    )
    const parsed = new URL(url)
    expect(parsed.searchParams.get("uploadId")).toBe("fictional-upload")
    expect(parsed.searchParams.get("partNumber")).toBe("2")
    expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length")
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("900")
    expect(url).not.toContain(config.R2_SECRET_ACCESS_KEY)
  })
})
