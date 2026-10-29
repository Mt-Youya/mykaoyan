import { Button, Input, Label } from "@mykaoyan/ui"
import { z } from "zod"
import type { FormEvent } from "react"
import { useEffect, useState } from "react"
import { useCatalog } from "../catalog"
import type { CourseSummary, HandoutSummary } from "../catalog"

const storageKey = "mykaoyan.topics-v1"
const topicSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  subject: z.string().regex(/^\d{3}$/),
  courses: z.array(z.string()),
  handouts: z.array(z.string()),
})
const topicsSchema = z.array(topicSchema)
type Topic = z.infer<typeof topicSchema>

function toggle(items: string[], setItems: (items: string[]) => void, item: string) {
  setItems(items.includes(item) ? items.filter((value) => value !== item) : [...items, item])
}

function ResourcePicker({
  subject,
  onChange,
}: {
  subject: string
  onChange: (courses: string[], handouts: string[]) => void
}) {
  const courses = useCatalog<CourseSummary[]>(`/api/courses?subject=${subject}`)
  const handouts = useCatalog<HandoutSummary[]>(`/api/handouts?subject=${subject}`)
  const [selectedCourses, setSelectedCourses] = useState<string[]>([])
  const [selectedHandouts, setSelectedHandouts] = useState<string[]>([])
  useEffect(() => onChange(selectedCourses, selectedHandouts), [onChange, selectedCourses, selectedHandouts])
  return (
    <div className="grid gap-5">
      <div>
        <p className="font-medium">关联课程</p>
        {courses.status === "loading" ? (
          <p className="mt-2 text-sm text-muted-foreground">正在读取已上架课程…</p>
        ) : courses.status === "ok" && courses.data.length ? (
          <div className="mt-3 grid gap-2">
            {courses.data.map((course) => (
              <label key={course.slug} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedCourses.includes(course.slug)}
                  onChange={() => toggle(selectedCourses, setSelectedCourses, course.slug)}
                />
                {course.title}
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">该科目暂时没有已上架课程可关联。</p>
        )}
      </div>
      <div>
        <p className="font-medium">关联讲义</p>
        {handouts.status === "loading" ? (
          <p className="mt-2 text-sm text-muted-foreground">正在读取已上架讲义…</p>
        ) : handouts.status === "ok" && handouts.data.length ? (
          <div className="mt-3 grid gap-2">
            {handouts.data.map((handout) => (
              <label key={handout.slug} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedHandouts.includes(handout.slug)}
                  onChange={() => toggle(selectedHandouts, setSelectedHandouts, handout.slug)}
                />
                {handout.title}
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">该科目暂时没有已上架讲义可关联。</p>
        )}
      </div>
    </div>
  )
}

export function TopicsPage() {
  const [topics, setTopics] = useState<Topic[] | null>(null)
  const [title, setTitle] = useState("")
  const [subject, setSubject] = useState("302")
  const [courses, setCourses] = useState<string[]>([])
  const [handouts, setHandouts] = useState<string[]>([])
  const [message, setMessage] = useState("")
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      setTopics(raw === null ? [] : topicsSchema.parse(JSON.parse(raw)))
    } catch {
      setTopics([])
      setMessage("本机专题无法读取，原文件未改动。")
    }
  }, [])
  function persist(next: Topic[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(topicsSchema.parse(next)))
      setTopics(next)
      return true
    } catch {
      setMessage("专题未保存。请检查浏览器存储设置。")
      return false
    }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!topics) return
    const parsed = topicSchema.safeParse({ id: crypto.randomUUID(), title, subject, courses, handouts })
    if (!parsed.success) return setMessage("请填写专题名称和三位考试科目代码。")
    if (persist([...topics, parsed.data])) {
      setTitle("")
      setCourses([])
      setHandouts([])
      setMessage("")
    }
  }
  return (
    <main className="page-container py-section">
      <div className="mx-auto grid max-w-[52rem] gap-10">
        <header className="border-b border-border pb-8">
          <p className="text-sm tracking-[0.08em] text-muted-foreground">我的学习 · 本机私有编排</p>
          <h1 className="mt-4 font-serif text-hero">专题</h1>
          <p className="mt-5 text-muted-foreground">
            专题只保存你组织资源的方式；课程和讲义仍从公开上架目录读取，错题和试卷仍在各自的私有页面中。
          </p>
        </header>
        {topics === null ? (
          <p role="status">正在读取本机专题…</p>
        ) : (
          <>
            <form className="grid gap-5 border-y border-border py-8" onSubmit={create}>
              <h2 className="text-section">新建专题</h2>
              <div className="grid gap-4 reading:grid-cols-2">
                <Label className="flex-col items-stretch gap-2">
                  专题名称
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="例如：导数与极值"
                    required
                  />
                </Label>
                <Label className="flex-col items-stretch gap-2">
                  考试科目代码
                  <Input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    pattern="[0-9]{3}"
                    required
                  />
                </Label>
              </div>
              <ResourcePicker
                key={subject}
                subject={subject}
                onChange={(nextCourses, nextHandouts) => {
                  setCourses(nextCourses)
                  setHandouts(nextHandouts)
                }}
              />
              <Button className="min-h-11 justify-self-start px-5 text-base" type="submit">
                保存专题
              </Button>
            </form>
            <section>
              <h2 className="text-section">我的专题</h2>
              {topics.length === 0 ? (
                <p className="mt-5 text-muted-foreground">还没有专题。先从已上架的课程或讲义中整理一个入口。</p>
              ) : (
                <ul className="mt-5 divide-y divide-border border-y border-border">
                  {topics.map((topic) => (
                    <li key={topic.id} className="py-5">
                      <strong>{topic.title}</strong>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {topic.subject} · 课程 {topic.courses.length} 个 · 讲义 {topic.handouts.length} 篇
                      </p>
                      <div className="mt-3 flex flex-wrap gap-4">
                        <a className="underline underline-offset-4" href={`/subjects/${topic.subject}`}>
                          查看公共目录
                        </a>
                        <a className="underline underline-offset-4" href="/papers">
                          查看我的试卷
                        </a>
                        <a className="underline underline-offset-4" href="/mistakes">
                          查看我的错题
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {message && (
              <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
                {message}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
