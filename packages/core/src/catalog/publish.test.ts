import { describe, expect, it } from "vitest"

import { publishLessonSchema } from "./index"
const request = {
  course: { slug: "fictional", title: "虚构课程", subjectCode: "302" },
  chapter: { slug: "fictional-chapter", title: "虚构章", position: 1 },
  slug: "fictional-lesson",
  title: "虚构讲",
  position: 1,
  scriptMarkdown: "虚构讲稿",
  video: { sha256: "a".repeat(64), md5: "AAAAAAAAAAAAAAAAAAAAAA==", size: 32 },
  subtitle: null,
}
describe("发布讲的公开输入", () => {
  it("接受内容字段，不允许发布时写上架状态或指定对象 key", () => {
    expect(publishLessonSchema.safeParse(request).success).toBe(true)
    expect(publishLessonSchema.safeParse({ ...request, listed: true }).success).toBe(false)
    expect(publishLessonSchema.safeParse({ ...request, videoKey: "arbitrary" }).success).toBe(false)
  })
  it("拒绝答案类标识、非法摘要和非整数大小", () => {
    expect(publishLessonSchema.safeParse({ ...request, slug: "lesson-answer" }).success).toBe(false)
    expect(
      publishLessonSchema.safeParse({ ...request, video: { ...request.video, sha256: "x", size: 0.5 } }).success,
    ).toBe(false)
  })
})
