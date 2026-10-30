import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common"

import { CONFIG } from "../config"
import type { Environment } from "../environment"
export const SUBMISSION_STORAGE = Symbol("submission-storage")
export type UploadedPart = { number: number; size: number; etag: string }
export interface SubmissionStorage {
  start(key: string): Promise<string>
  sign(key: string, uploadId: string, number: number, size: number): Promise<string>
  parts(key: string, uploadId: string): Promise<UploadedPart[]>
  complete(key: string, uploadId: string, parts: UploadedPart[]): Promise<void>
  head(key: string): Promise<{ size: number; type: string } | null>
  remove(key: string): Promise<void>
}
@Injectable()
export class R2SubmissionStorage implements SubmissionStorage {
  private client?: S3Client
  constructor(@Inject(CONFIG) private config: Environment) {}
  private s3() {
    if (
      !this.config.R2_ACCESS_KEY_ID ||
      !this.config.R2_SECRET_ACCESS_KEY ||
      !this.config.R2_ENDPOINT ||
      !this.config.R2_BUCKET
    )
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
  async start(key: string) {
    const result = await this.s3().send(
      new CreateMultipartUploadCommand({ Bucket: this.config.R2_BUCKET, Key: key, ContentType: "video/mp4" }),
    )
    if (!result.UploadId) throw new Error("分片上传未返回编号")
    return result.UploadId
  }
  async sign(key: string, uploadId: string, number: number, size: number) {
    return getSignedUrl(
      this.s3(),
      new UploadPartCommand({
        Bucket: this.config.R2_BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: number,
        ContentLength: size,
      }),
      { expiresIn: 900, signableHeaders: new Set(["content-length"]) },
    )
  }
  async parts(key: string, uploadId: string) {
    const result = await this.s3().send(
      new ListPartsCommand({ Bucket: this.config.R2_BUCKET, Key: key, UploadId: uploadId, MaxParts: 100 }),
    )
    if (result.IsTruncated) throw new Error("分片数量超出投稿限制")
    return (result.Parts ?? []).map((p) => {
      if (!p.PartNumber || p.Size === undefined || !p.ETag) throw new Error("分片元数据不完整")
      return { number: p.PartNumber, size: p.Size, etag: p.ETag }
    })
  }
  async complete(key: string, uploadId: string, parts: UploadedPart[]) {
    await this.s3().send(
      new CompleteMultipartUploadCommand({
        Bucket: this.config.R2_BUCKET,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.number, ETag: p.etag })) },
      }),
    )
  }
  async head(key: string) {
    try {
      const h = await this.s3().send(new HeadObjectCommand({ Bucket: this.config.R2_BUCKET, Key: key }))
      return { size: h.ContentLength ?? -1, type: h.ContentType ?? "" }
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null
      throw error
    }
  }
  async remove(key: string) {
    await this.s3().send(new DeleteObjectCommand({ Bucket: this.config.R2_BUCKET, Key: key }))
  }
}
