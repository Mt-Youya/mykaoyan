import { createHmac } from "node:crypto"

import { Inject, Injectable } from "@nestjs/common"

import { CatalogService } from "../catalog"
import { CONFIG } from "../config"
import type { Environment } from "../environment"

/** 播放令牌的最长有效期（秒），与媒体 Worker 的校验上限一致。 */
export const MAX_TOKEN_TTL_SECONDS = 3600

/** 播放令牌的默认有效期（秒）；前端在到期前续签。 */
export const DEFAULT_TOKEN_TTL_SECONDS = 600

/** 一条媒体对象的播放地址与令牌。 */
export type SignedMedia = { key: string; token: string; url: string }

export type PlaybackToken = {
  videoKey: string
  token: string
  expiresAt: string
  mediaUrl: string
  /** 字幕的独立令牌：媒体 Worker 要求令牌的 key 与请求路径一致。 */
  subtitle: SignedMedia | null
}

/**
 * 签发媒体播放令牌。
 *
 * 令牌格式与媒体 Worker 的校验一一对应：`base64url(claims).base64url(HMAC-SHA256(payload))`，
 * claims 为 `{ v: 1, key, subject, iat, exp }`，签名覆盖第一个 base64url 字符串。
 * 签名密钥只存在后端与媒体 Worker 两处。
 */
@Injectable()
export class PlaybackService {
  constructor(
    @Inject(CONFIG) private readonly config: Environment,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  async signForLesson(slug: string, subject: string, ttlSeconds: number): Promise<PlaybackToken | undefined> {
    const lesson = await this.catalog.getLesson(slug)
    if (!lesson) return undefined
    return this.signMedia(lesson.videoKey, subject, ttlSeconds, lesson.subtitleKey)
  }

  /** 调用方负责可见性与权限；讲和投稿共用同一令牌格式。 */
  signMedia(videoKey: string, subject: string, ttlSeconds: number, subtitleKey: string | null = null): PlaybackToken {
    const now = Math.floor(Date.now() / 1000)
    const signed = (key: string): SignedMedia => {
      const claims = { v: 1, key, subject, iat: now, exp: now + ttlSeconds }
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url")
      const signature = createHmac("sha256", this.config.MEDIA_SIGNING_KEY).update(payload).digest("base64url")
      const token = `${payload}.${signature}`
      return { key, token, url: `${base}/${key}?token=${encodeURIComponent(token)}` }
    }
    const base = (this.config.MEDIA_BASE_URL ?? "https://media.mykaoyan.cn").replace(/\/$/, "")
    const video = signed(videoKey)
    return {
      videoKey,
      token: video.token,
      expiresAt: new Date((now + ttlSeconds) * 1000).toISOString(),
      mediaUrl: video.url,
      subtitle: subtitleKey ? signed(subtitleKey) : null,
    }
  }
}
