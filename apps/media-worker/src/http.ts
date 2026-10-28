function dateMatches(header: string | null, uploaded: Date) {
  if (!header) return false
  const parsed = Date.parse(header)
  return Number.isFinite(parsed) && Math.floor(uploaded.getTime() / 1000) * 1000 <= parsed
}

function etagMatches(header: string, etag: string, weak = false) {
  return header.split(",").some((item) => {
    const value = item.trim()
    return value === "*" || (weak ? value.replace(/^W\//, "") === etag : value === etag)
  })
}

export function conditionalStatus(headers: Headers, object: R2Object): 304 | 412 | undefined {
  const match = headers.get("If-Match")
  if (match && !etagMatches(match, object.httpEtag)) return 412
  const unmodified = headers.get("If-Unmodified-Since")
  if (!match && unmodified && Number.isFinite(Date.parse(unmodified)) && !dateMatches(unmodified, object.uploaded))
    return 412
  const none = headers.get("If-None-Match")
  if (none && etagMatches(none, object.httpEtag, true)) return 304
  if (!none && dateMatches(headers.get("If-Modified-Since"), object.uploaded)) return 304
}

export function allowsRange(headers: Headers, object: R2Object) {
  const value = headers.get("If-Range")
  return (
    !value || value === object.httpEtag || Date.parse(value) === Math.floor(object.uploaded.getTime() / 1000) * 1000
  )
}

export function parseRange(
  header: string | null,
  size: number
): { offset: number; length: number } | "unsatisfiable" | undefined {
  if (!header) return
  // shortcut: 多区间请求退回完整响应，需要并行分段下载时再支持 multipart。
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return
  if (!size) return "unsatisfiable"
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "unsatisfiable"
    const length = Math.min(suffix, size)
    return { offset: size - length, length }
  }
  const offset = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset >= size || end < offset)
    return "unsatisfiable"
  return { offset, length: Math.min(end, size - 1) - offset + 1 }
}
