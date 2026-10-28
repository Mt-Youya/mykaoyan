import { randomUUID } from "node:crypto"
import { BadRequestException, Body, Controller, Inject, NotFoundException, Param, Post, Req, Res } from "@nestjs/common"
import { fromNodeHeaders } from "better-auth/node"
import { z } from "zod"
import { AUTH } from "../auth"
import type { Auth } from "../auth"
import { DEFAULT_TOKEN_TTL_SECONDS, MAX_TOKEN_TTL_SECONDS, PlaybackService } from "./service"

/** 访客标识 cookie：没有账号时用它对令牌签发者去重。 */
export const VISITOR_COOKIE = "mk_visitor"
const VISITOR_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

const bodySchema = z.object({ ttlSeconds: z.number().int().min(1).max(MAX_TOKEN_TTL_SECONDS).optional() }).strict()

function readVisitor(cookie: string | string[] | undefined): string | undefined {
  const header = Array.isArray(cookie) ? cookie.join("; ") : cookie
  const match = header?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})(?:;|$)`))
  return match?.[1]
}

/** 视频播放令牌的签发接口；访客与账号都能拿到短时令牌。 */
@Controller("lessons")
export class PlaybackController {
  constructor(
    @Inject(PlaybackService) private readonly playback: PlaybackService,
    @Inject(AUTH) private readonly auth: Auth
  ) {}

  @Post(":slug/playback-token")
  async create(
    @Param("slug") slug: string,
    @Body() body: unknown,
    @Req() request: { headers: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }
  ) {
    const parsed = bodySchema.safeParse(body ?? {})
    if (!parsed.success) {
      throw new BadRequestException(`ttlSeconds 必须是 1 到 ${MAX_TOKEN_TTL_SECONDS} 之间的整数`)
    }

    // 已登录时按账号签发，访客才用 visitor cookie；两者都只用于标识「谁在看这一讲」。
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) }).catch(() => null)
    let subject = session?.user?.id ?? readVisitor(request.headers.cookie)
    if (!subject) {
      subject = randomUUID()
      response.setHeader(
        "Set-Cookie",
        `${VISITOR_COOKIE}=${subject}; Path=/; Max-Age=${VISITOR_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax`
      )
    }

    const ttlSeconds = parsed.data.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS
    const token = await this.playback.signForLesson(slug, subject, ttlSeconds)
    if (!token) throw new NotFoundException("讲不存在")
    return token
  }
}
