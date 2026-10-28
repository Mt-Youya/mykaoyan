import { HttpException } from "@nestjs/common"

/**
 * 研招网（yz.chsi.com.cn）硕士专业目录的网页内部请求客户端。
 *
 * 这些请求没有官方文档，不是开放 API；只在服务端调用，地址与原始响应不返回给浏览器。
 * 所有请求串行并保持最小间隔，排队过长直接拒绝，避免把访客流量放大到上游。
 */
export const CHSI_ORIGIN = "https://yz.chsi.com.cn"

/** 上游失败的分类；浏览器只看到 `title` 文案与状态码。 */
export type UpstreamFailure = "login_required" | "blocked" | "unavailable" | "bad_payload" | "busy"

export class UpstreamError extends HttpException {
  constructor(
    readonly failure: UpstreamFailure,
    message: string
  ) {
    super(message, failure === "busy" ? 503 : 502)
  }
}

export type ChsiRequest = { path: string; method: "GET" | "POST"; params?: Record<string, string> }

export type ChsiClientOptions = {
  fetch: typeof fetch
  sleep?: (ms: number) => Promise<void>
  minIntervalMs?: number
  timeoutMs?: number
  maxRetries?: number
  maxPending?: number
}

const LOGIN_HINTS = ["请登录", "登录后", "登录即可"]
const USER_AGENT = "mykaoyan-api (+https://mykaoyan.cn)"

export class ChsiClient {
  private readonly fetch: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly minIntervalMs: number
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly maxPending: number
  private queue: Promise<unknown> = Promise.resolve()
  private pending = 0
  private lastRequestAt = 0

  constructor(options: ChsiClientOptions) {
    this.fetch = options.fetch
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.minIntervalMs = options.minIntervalMs ?? 1200
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.maxRetries = options.maxRetries ?? 2
    this.maxPending = options.maxPending ?? 20
  }

  /** 解析 JSON；HTTP 200 的登录页、验证页或 `flag:false` 都按失败处理，不当作空数据。 */
  async json(request: ChsiRequest): Promise<unknown> {
    const text = await this.text(request)
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new UpstreamError("bad_payload", "研招网返回的不是数据，可能是登录页或验证页")
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "flag" in parsed && parsed.flag === false) {
      const message = "msg" in parsed && typeof parsed.msg === "string" ? parsed.msg : ""
      if (LOGIN_HINTS.some((hint) => message.includes(hint))) {
        throw new UpstreamError("login_required", "研招网要求登录后才能继续查询")
      }
      throw new UpstreamError("bad_payload", "研招网未返回查询结果")
    }
    return parsed
  }

  /** 原始文本；串行、限速、超时与退避都在这里。 */
  text(request: ChsiRequest): Promise<string> {
    if (this.pending >= this.maxPending) {
      return Promise.reject(new UpstreamError("busy", "招生目录查询繁忙，请稍后再试"))
    }
    this.pending += 1
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now()
      if (wait > 0) await this.sleep(wait)
      try {
        return await this.attempt(request)
      } finally {
        this.lastRequestAt = Date.now()
      }
    })
    const settled = run.finally(() => {
      this.pending -= 1
    })
    this.queue = settled.catch(() => undefined)
    return settled
  }

  private async attempt(request: ChsiRequest): Promise<string> {
    const url = new URL(CHSI_ORIGIN + request.path)
    let body: string | undefined
    if (request.method === "GET") {
      for (const [key, value] of Object.entries(request.params ?? {})) url.searchParams.set(key, value)
    } else {
      body = new URLSearchParams(request.params).toString()
    }
    let failure = new UpstreamError("unavailable", "研招网暂时无法访问")
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) await this.sleep(Math.min(4000, 300 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 200))
      try {
        const response = await this.fetch(url, {
          method: request.method,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "X-Requested-With": "XMLHttpRequest",
            Referer: `${CHSI_ORIGIN}/zsml/`,
            ...(body === undefined ? {} : { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }),
          },
          ...(body === undefined ? {} : { body }),
          signal: AbortSignal.timeout(this.timeoutMs),
        })
        if (response.status === 403) throw new UpstreamError("blocked", "研招网拒绝了本次查询")
        if (response.status === 429 || response.status >= 500) continue
        if (!response.ok) throw failure
        const text = await response.text()
        // 上游风控页可能以 200 返回。
        if (text.includes("403 Forbidden")) throw new UpstreamError("blocked", "研招网拒绝了本次查询")
        return text
      } catch (error) {
        if (error instanceof UpstreamError) throw error
        // 超时与网络错误进入下一次重试。
        failure = new UpstreamError("unavailable", "研招网暂时无法访问")
      }
    }
    throw failure
  }
}
