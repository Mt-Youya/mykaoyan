import { describe, expect, it } from "vitest"

import { inspectVideo } from "./video"
function box(type: string, ...children: Uint8Array[]) {
  const bytes = new Uint8Array(8 + children.reduce((n, c) => n + c.length, 0)),
    view = new DataView(bytes.buffer)
  view.setUint32(0, bytes.length)
  bytes.set(new TextEncoder().encode(type), 4)
  let offset = 8
  for (const child of children) {
    bytes.set(child, offset)
    offset += child.length
  }
  return bytes
}
function video(codec = "avc1", seconds = 10) {
  const mvhd = new Uint8Array(20)
  new DataView(mvhd.buffer).setUint32(12, 1000)
  new DataView(mvhd.buffer).setUint32(16, seconds * 1000)
  const hdlr = new Uint8Array(12)
  hdlr.set(new TextEncoder().encode("vide"), 8)
  const entries = new Uint8Array(8)
  new DataView(entries.buffer).setUint32(4, 1)
  return new File(
    [
      box("ftyp", new TextEncoder().encode("isom0000")),
      box(
        "moov",
        box("mvhd", mvhd),
        box("trak", box("mdia", box("hdlr", hdlr), box("minf", box("stbl", box("stsd", entries, box(codec)))))),
      ),
      box("mdat", new Uint8Array([0])),
    ],
    "fictional.mp4",
    { type: "video/mp4" },
  )
}
describe("上传前读取MP4实际视频轨道", () => {
  it("识别H.264与时长，不凭扩展名或MIME相信HEVC文件", async () => {
    await expect(inspectVideo(video())).resolves.toMatchObject({
      duration: 10,
      codec: "h264",
      contentType: "video/mp4",
    })
    await expect(inspectVideo(video("hvc1"))).rejects.toThrow("H.264")
    await expect(inspectVideo(video("avc1", 1801))).rejects.toThrow("30分钟")
    await expect(inspectVideo(new File(["avc1"], "renamed.mp4"))).rejects.toThrow()
  })
})
