import { Button } from "@mykaoyan/ui"
import { useCallback, useEffect, useRef, useState } from "react"

/** 后端签发的播放令牌；字幕是独立令牌，因为媒体 Worker 要求令牌的 key 与路径一致。 */
type PlaybackToken = {
  videoKey: string
  token: string
  expiresAt: string
  mediaUrl: string
  subtitle: { key: string; token: string; url: string } | null
}

type PlayerError = "token-failed" | "autoplay-blocked" | "unsupported" | "unknown"

/** 距离令牌到期多少毫秒开始续签。 */
const RENEW_BEFORE_MS = 60_000
/** 续签失败的重试间隔（毫秒）。 */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000]

async function fetchToken(slug: string, kind: "lessons" | "submissions"): Promise<PlaybackToken> {
  const response = await fetch(`/api/${kind}/${encodeURIComponent(slug)}/playback-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ttlSeconds: 600 }),
    credentials: "same-origin",
  })
  if (!response.ok) throw new Error(`令牌签发失败：${response.status}`)
  return (await response.json()) as PlaybackToken
}

/**
 * 讲的视频播放器。
 *
 * 播放令牌到期前自动续签：续签前记录播放位置，续签后回到原位置继续；续签失败按退避重试，
 * 最终失败时明确提示而不是静默停止。切换到另一讲时按新 slug 重新签发并替换视频源，
 * 不会沿用上一讲的视频。
 */
export function LessonPlayer({
  slug,
  title,
  kind = "lessons",
}: {
  slug: string
  title: string
  kind?: "lessons" | "submissions"
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [token, setToken] = useState<PlaybackToken | null>(null)
  const [error, setError] = useState<PlayerError | null>(null)
  const pendingPosition = useRef<number | null>(null)
  const pendingPlay = useRef(false)
  const retryIndex = useRef(0)

  const applyToken = useCallback((next: PlaybackToken, resume: boolean) => {
    const video = videoRef.current
    if (video && resume) {
      pendingPosition.current = video.currentTime
      pendingPlay.current = !video.paused
    }
    setToken(next)
    setError(null)
    retryIndex.current = 0
  }, [])

  const renew = useCallback(async () => {
    try {
      applyToken(await fetchToken(slug, kind), true)
    } catch {
      const delay = RETRY_DELAYS_MS[retryIndex.current]
      if (delay === undefined) {
        setError("token-failed")
        return
      }
      retryIndex.current += 1
      window.setTimeout(() => void renew(), delay)
    }
  }, [applyToken, slug, kind])

  // 换讲时清空状态：避免沿用上一讲的视频与令牌。
  useEffect(() => {
    setToken(null)
    setError(null)
    pendingPosition.current = null
    pendingPlay.current = false
    retryIndex.current = 0
    let cancelled = false
    void fetchToken(slug, kind)
      .then((next) => {
        if (!cancelled) applyToken(next, false)
      })
      .catch(() => {
        if (!cancelled) setError("token-failed")
      })
    return () => {
      cancelled = true
    }
  }, [applyToken, slug, kind])

  // 到期前续签；每次令牌变化都重新排期。
  useEffect(() => {
    if (!token) return
    const remaining = new Date(token.expiresAt).getTime() - Date.now() - RENEW_BEFORE_MS
    const timer = window.setTimeout(() => void renew(), Math.max(remaining, 0))
    return () => window.clearTimeout(timer)
  }, [renew, token])

  // 视频源换好、元数据就绪后，恢复播放位置与播放状态。
  useEffect(() => {
    const video = videoRef.current
    if (!video || !token) return
    video.load()
    const restore = () => {
      if (pendingPosition.current !== null) {
        video.currentTime = pendingPosition.current
        pendingPosition.current = null
      }
      if (pendingPlay.current) {
        pendingPlay.current = false
        video.play().catch(handlePlayFailure)
      }
    }
    video.addEventListener("loadedmetadata", restore, { once: true })
    return () => video.removeEventListener("loadedmetadata", restore)
  }, [token])

  function handlePlayFailure(reason: unknown) {
    const name = reason instanceof DOMException ? reason.name : ""
    if (name === "NotAllowedError") setError("autoplay-blocked")
    else if (name === "NotSupportedError") setError("unsupported")
    else setError("unknown")
  }

  if (error) {
    const message =
      error === "token-failed"
        ? "播放凭证获取失败，请刷新页面后重试。"
        : error === "autoplay-blocked"
          ? "浏览器阻止了自动播放，请点击播放按钮。"
          : error === "unsupported"
            ? "当前浏览器无法播放这个视频格式。"
            : "播放失败，请重试。"
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-current p-4" role="alert">
        <p>{message}</p>
        <Button type="button" variant="outline" className="min-h-11 px-4" onClick={() => void renew()}>
          重试
        </Button>
      </div>
    )
  }

  if (!token) {
    return <p className="opacity-[0.7]">正在准备播放…</p>
  }

  return (
    <video
      ref={videoRef}
      className="aspect-video max-h-[70svh] w-full rounded-lg bg-black object-contain"
      controls
      playsInline
      preload="metadata"
      crossOrigin="anonymous"
      src={token.mediaUrl}
      onError={() => setError("unsupported")}
    >
      {token.subtitle ? (
        <track kind="subtitles" src={token.subtitle.url} srcLang="zh" label="中文字幕" default />
      ) : null}
      {title}
    </video>
  )
}
