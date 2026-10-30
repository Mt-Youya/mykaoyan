import { describe, expect, it } from "vitest"

import { readEnvironment } from "../environment"
import { R2PublishStorage } from "./storage"
describe("R2 发布预签名", () => {
  it("未配置时失败；签名约束对象摘要、内容类型与禁止覆盖，不暴露服务器密钥", async () => {
    const base = { NODE_ENV: "test", PORT: "3001", MEDIA_SIGNING_KEY: "fictional-media-signing-key-32-characters" }
    const asset = { sha256: "a".repeat(64), md5: "AAAAAAAAAAAAAAAAAAAAAA==", size: 32 }
    await expect(
      new R2PublishStorage(readEnvironment(base)).upload("fictional/key", asset, "video/mp4"),
    ).rejects.toThrow("尚未配置")
    const config = readEnvironment({
      ...base,
      R2_ACCOUNT_ID: "a".repeat(32),
      R2_ACCESS_KEY_ID: "fictional-access-id",
      R2_SECRET_ACCESS_KEY: "fictional-private-value",
      R2_BUCKET: "fictional-bucket",
      R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
    })
    const signed = await new R2PublishStorage(config).upload("lessons/fictional/video.mp4", asset, "video/mp4")
    const headers = new URL(signed.url).searchParams.get("X-Amz-SignedHeaders")
    expect(headers).toContain("content-md5")
    expect(headers).toContain("content-type")
    expect(headers).toContain("if-none-match")
    expect(signed.url).not.toContain(config.R2_SECRET_ACCESS_KEY)
    expect(signed.headers).toMatchObject({ "Content-MD5": asset.md5, "If-None-Match": "*" })
  })
  it("环境变量只配部分、空串或端点账号不符都拒绝启动", () => {
    const base = { NODE_ENV: "test", PORT: "3001", MEDIA_SIGNING_KEY: "fictional-media-signing-key-32-characters" }
    expect(() => readEnvironment({ ...base, R2_BUCKET: "bucket-only" })).toThrow()
    expect(() => readEnvironment({ ...base, R2_ACCOUNT_ID: "" })).toThrow()
  })
})
