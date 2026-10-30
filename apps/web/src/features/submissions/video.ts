import { SUBMISSION_MAX_SIZE, SUBMISSION_PART_SIZE } from "@mykaoyan/core"
type Box = { type: string; start: number; end: number }
const text = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, end))
function boxHeader(b: Uint8Array, offset: number, end: number): Box {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let size = view.getUint32(offset),
    header = 8
  if (size === 1) {
    size = Number(view.getBigUint64(offset + 8))
    header = 16
  }
  if (size === 0) size = end - offset
  if (!Number.isSafeInteger(size) || size < header || offset + size > end) throw new Error("MP4结构不完整")
  return { type: text(b, offset + 4, offset + 8), start: offset + header, end: offset + size }
}
function boxes(b: Uint8Array, start = 0, end = b.length) {
  const result: Box[] = []
  for (let offset = start; offset < end;) {
    if (offset + 8 > end) throw new Error("MP4结构不完整")
    const box = boxHeader(b, offset, end)
    result.push(box)
    offset = box.end
  }
  return result
}
function movieMetadata(b: Uint8Array) {
  const children = boxes(b),
    mvhd = children.find((c) => c.type === "mvhd")
  if (!mvhd) throw new Error("无法读取MP4时长")
  const v = new DataView(b.buffer, b.byteOffset + mvhd.start, mvhd.end - mvhd.start),
    version = v.getUint8(0)
  if (version !== 0 && version !== 1) throw new Error("不支持的MP4时长格式")
  const duration = version === 1 ? Number(v.getBigUint64(24)) / v.getUint32(20) : v.getUint32(16) / v.getUint32(12)
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1800) throw new Error("视频时长须大于0且不超过30分钟")
  let videos = 0
  for (const track of children.filter((c) => c.type === "trak")) {
    const mdia = boxes(b, track.start, track.end).find((c) => c.type === "mdia")
    if (!mdia) continue
    const media = boxes(b, mdia.start, mdia.end),
      handler = media.find((c) => c.type === "hdlr")
    if (!handler || text(b, handler.start + 8, handler.start + 12) !== "vide") continue
    videos++
    let container = media.find((c) => c.type === "minf")
    for (const type of ["stbl", "stsd"]) {
      container = container && boxes(b, container.start, container.end).find((c) => c.type === type)
    }
    if (!container) throw new Error("无法识别视频编码，须为H.264")
    const entries = boxes(b, container.start + 8, container.end)
    if (!entries.length || entries.some((c) => c.type !== "avc1" && c.type !== "avc3"))
      throw new Error("仅支持H.264编码的mp4视频")
  }
  if (!videos) throw new Error("MP4不含H.264视频轨道")
  return duration
}
/** 只读取容器头与moov，跳过媒体数据；不一次性把500MB文件装入内存。 */
export async function inspectVideo(file: File) {
  if (!/\.mp4$/i.test(file.name) || file.size <= 0 || file.size > SUBMISSION_MAX_SIZE)
    throw new Error("请选择不超过500MB的mp4文件")
  let offset = 0,
    ftyp = false,
    mdat = false,
    duration: number | undefined,
    count = 0
  while (offset < file.size) {
    if (++count > 10000) throw new Error("MP4容器条目过多")
    const b = new Uint8Array(await file.slice(offset, offset + 16).arrayBuffer())
    if (b.length < 8) throw new Error("MP4结构不完整")
    const header = boxHeader(b, 0, file.size - offset),
      size = header.end
    if (header.type === "ftyp") ftyp = true
    if (header.type === "mdat") mdat = true
    if (header.type === "moov") {
      if (size > 16 * 1024 * 1024) throw new Error("MP4元数据过大，暂不支持此文件")
      duration = movieMetadata(new Uint8Array(await file.slice(offset + header.start, offset + size).arrayBuffer()))
    }
    offset += size
  }
  if (!ftyp || !mdat || duration === undefined) throw new Error("文件不是完整的mp4视频")
  return { duration, codec: "h264" as const, contentType: "video/mp4" as const }
}
/** 逐片SHA-256再合成文件指纹，续传时核对整个文件，内存上限为一片。 */
export async function fingerprint(file: File, onProgress: (percent: number) => void, signal?: AbortSignal) {
  const hashes: Uint8Array[] = []
  for (let offset = 0; offset < file.size; offset += SUBMISSION_PART_SIZE) {
    if (signal?.aborted) throw new Error("上传已暂停")
    hashes.push(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await file.slice(offset, offset + SUBMISSION_PART_SIZE).arrayBuffer()),
      ),
    )
    onProgress(Math.min(100, Math.round(((offset + SUBMISSION_PART_SIZE) / file.size) * 100)))
  }
  const bytes = new Uint8Array(hashes.length * 32)
  hashes.forEach((h, i) => bytes.set(h, i * 32))
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")
}
