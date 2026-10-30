import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common"

import type { PublishLesson } from "@mykaoyan/core"

import { CONFIG } from "../config"
import type { Environment } from "../environment"
export type Asset = PublishLesson["video"]
export const PUBLISH_STORAGE = Symbol("publish-storage")
export interface PublishStorage {
  upload(key: string, asset: Asset, type: string): Promise<{ url: string; headers: Record<string, string> }>
  verify(key: string, asset: Asset, type: string): Promise<boolean>
  remove(key: string): Promise<void>
}
@Injectable()
export class R2PublishStorage implements PublishStorage {
  private client?: S3Client
  constructor(@Inject(CONFIG) private config: Environment) {}
  private s3() {
    if (!this.config.R2_ACCESS_KEY_ID || !this.config.R2_SECRET_ACCESS_KEY || !this.config.R2_ENDPOINT)
      throw new ServiceUnavailableException("R2 S3 凭据尚未配置")
    this.client ??= new S3Client({
      region: "auto",
      endpoint: this.config.R2_ENDPOINT,
      credentials: { accessKeyId: this.config.R2_ACCESS_KEY_ID, secretAccessKey: this.config.R2_SECRET_ACCESS_KEY },
      requestChecksumCalculation: "WHEN_REQUIRED",
      maxAttempts: 1,
    })
    return this.client
  }
  async upload(key: string, asset: Asset, type: string) {
    const headers = { "Content-Type": type, "Content-MD5": asset.md5, "If-None-Match": "*" }
    const url = await getSignedUrl(
      this.s3(),
      new PutObjectCommand({
        Bucket: this.config.R2_BUCKET,
        Key: key,
        ContentType: type,
        ContentMD5: asset.md5,
        IfNoneMatch: "*",
      }),
      { expiresIn: 900, signableHeaders: new Set(["content-type", "content-md5", "if-none-match"]) },
    )
    return { url, headers }
  }
  async verify(key: string, asset: Asset, type: string) {
    try {
      const head = await this.s3().send(new HeadObjectCommand({ Bucket: this.config.R2_BUCKET, Key: key }))
      return (
        head.ContentLength === asset.size &&
        head.ContentType === type &&
        head.ETag?.replaceAll('"', "") === Buffer.from(asset.md5, "base64").toString("hex")
      )
    } catch {
      return false
    }
  }
  async remove(key: string) {
    await this.s3().send(new DeleteObjectCommand({ Bucket: this.config.R2_BUCKET, Key: key }))
  }
}
