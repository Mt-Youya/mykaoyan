import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../app"
import { readEnvironment } from "../environment"

/**
 * 课程浏览的公开接口测试（真实 Postgres）。
 *
 * 所有内容都是虚构示例；测试关注「上架链」：课程、章、讲任一级下架，其下内容对访客都不可见。
 */
const TEST_ENV = {
  ...process.env,
  NODE_ENV: "test",
  PORT: "3001",
  MEDIA_SIGNING_KEY: "test-media-signing-key-at-least-32-chars",
}

describe("课程、章、讲、讲义的公开接口", () => {
  let app: Awaited<ReturnType<typeof createApp>>
  let origin: string
  let sql: ReturnType<typeof postgres>

  const insertCourse = async (slug: string, position: number, listed: boolean) => {
    const [row] = await sql<{ id: string }[]>`
      insert into courses (subject_code, slug, title, summary, position, listed)
      values ('302', ${slug}, ${`课程 ${slug}`}, '虚构示例摘要', ${position}, ${listed})
      returning id`
    return row!.id
  }

  const insertChapter = async (courseId: string, title: string, position: number, listed: boolean) => {
    const [row] = await sql<{ id: string }[]>`
      insert into chapters (course_id, title, position, listed)
      values (${courseId}, ${title}, ${position}, ${listed})
      returning id`
    return row!.id
  }

  const insertLesson = async (chapterId: string, slug: string, position: number, listed: boolean) => {
    await sql`
      insert into lessons (chapter_id, slug, title, position, video_key, script_markdown, listed)
      values (${chapterId}, ${slug}, ${`讲 ${slug}`}, ${position}, ${`videos/${slug}.mp4`}, ${`# ${slug} 的讲稿`}, ${listed})`
  }

  beforeAll(async () => {
    const config = readEnvironment({ ...TEST_ENV })
    const url = new URL(config.DATABASE_URL!)
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test") {
      throw new Error("集成测试只允许专用的本机 mykaoyan_test 临时库")
    }
    await cleanup()

    app = await createApp(config)
    await app.listen(0, "127.0.0.1")
    origin = await app.getUrl()
    sql = postgres(config.DATABASE_URL!, { prepare: false, ssl: false })

    // 已上架课程：两章，讲故意乱序插入，验证按 position 排序。
    const course = await insertCourse("math-2", 2, true)
    const first = await insertChapter(course, "第一章 函数", 2, true)
    const second = await insertChapter(course, "第二章 导数", 1, true)
    await insertLesson(first, "functions-2", 2, true)
    await insertLesson(first, "functions-1", 1, true)
    await insertLesson(second, "derivative-1", 1, true)
    // 已上架章下的未上架讲：访客不可见。
    await insertLesson(second, "derivative-hidden", 2, false)

    // 已上架课程下的未上架章：整章连讲都不可见。
    const draftChapter = await insertChapter(course, "第三章 未上架", 3, false)
    await insertLesson(draftChapter, "draft-chapter-lesson", 1, true)

    // 未上架课程：课程本身与其中的讲都不可见。
    const hiddenCourse = await insertCourse("hidden-course", 1, false)
    const hiddenChapter = await insertChapter(hiddenCourse, "隐藏章", 1, true)
    await insertLesson(hiddenChapter, "hidden-course-lesson", 1, true)

    // 另一门已上架课程，验证按 position 排序与科目过滤。
    const other = await insertCourse("cs-408", 1, true)
    const otherChapter = await insertChapter(other, "第一章 数据结构", 1, true)
    await insertLesson(otherChapter, "data-structure-1", 1, true)

    await sql`
      insert into handouts (subject_code, slug, title, markdown, position, listed)
      values ('302', 'cheatsheet-listed', '已上架讲义', '# 虚构讲义', 1, true),
             ('302', 'cheatsheet-hidden', '未上架讲义', '# 不应出现', 2, false)`
  })

  async function cleanup() {
    const config = readEnvironment({ ...TEST_ENV })
    const client = postgres(config.DATABASE_URL!, { prepare: false, ssl: false })
    try {
      await client`delete from lessons`
      await client`delete from chapters`
      await client`delete from courses`
      await client`delete from handouts`
    } finally {
      await client.end({ timeout: 1 })
    }
  }

  afterAll(async () => {
    await cleanup()
    await sql?.end({ timeout: 1 })
    await app?.close()
  })

  it("按考试科目列出已上架课程，并按顺序排列", async () => {
    const response = await fetch(`${origin}/api/courses?subject=302`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { slug: string }[]
    expect(body.map((item) => item.slug)).toEqual(["cs-408", "math-2"])
  })

  it("课程详情按 position 排列章与讲，且不含任何未上架内容", async () => {
    const response = await fetch(`${origin}/api/courses/math-2`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      chapters: { title: string; lessons: { slug: string }[] }[]
    }
    expect(body.chapters.map((chapter) => chapter.title)).toEqual(["第二章 导数", "第一章 函数"])
    expect(body.chapters[0]!.lessons.map((lesson) => lesson.slug)).toEqual(["derivative-1"])
    expect(body.chapters[1]!.lessons.map((lesson) => lesson.slug)).toEqual(["functions-1", "functions-2"])
    expect(JSON.stringify(body)).not.toContain("derivative-hidden")
    expect(JSON.stringify(body)).not.toContain("draft-chapter-lesson")
  })

  it("讲详情返回讲稿与视频对象 key", async () => {
    const response = await fetch(`${origin}/api/lessons/functions-1`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      slug: "functions-1",
      title: "讲 functions-1",
      scriptMarkdown: "# functions-1 的讲稿",
      videoKey: "videos/functions-1.mp4",
      courseSlug: "math-2",
    })
  })

  it("未上架的课程、章下的讲、课程下的讲都返回 404", async () => {
    const paths = [
      "/api/courses/hidden-course",
      "/api/lessons/hidden-course-lesson",
      "/api/lessons/draft-chapter-lesson",
    ]
    for (const path of paths) {
      const response = await fetch(`${origin}${path}`)
      expect(response.status, path).toBe(404)
      expect(response.headers.get("content-type")).toContain("application/problem+json")
    }
  })

  it("未上架的讲返回 404", async () => {
    const response = await fetch(`${origin}/api/lessons/derivative-hidden`)
    expect(response.status).toBe(404)
  })

  it("讲义只列出与返回已上架内容", async () => {
    const list = await fetch(`${origin}/api/handouts?subject=302`)
    expect(list.status).toBe(200)
    const items = (await list.json()) as { slug: string }[]
    expect(items.map((item) => item.slug)).toEqual(["cheatsheet-listed"])

    const listed = await fetch(`${origin}/api/handouts/cheatsheet-listed`)
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject({ slug: "cheatsheet-listed", markdown: "# 虚构讲义" })

    const hidden = await fetch(`${origin}/api/handouts/cheatsheet-hidden`)
    expect(hidden.status).toBe(404)
  })

  it("缺少或非法的 subject 参数返回 400", async () => {
    for (const query of ["", "?subject=", "?subject=abc", "?subject=3020"]) {
      const response = await fetch(`${origin}/api/courses${query}`)
      expect(response.status, query).toBe(400)
    }
  })
})
