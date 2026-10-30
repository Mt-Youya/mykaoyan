import { Badge, Button } from "@mykaoyan/ui"
import { useCallback, useEffect, useState } from "react"
import { AdminCommentsPanel } from "../comments"
import { AdminSubmissionsPanel } from "../submissions"
import { AdminMembershipPanel } from "../membership"
import { fetchAdminContent, setListing } from "./api"
import type { AdminContent, AdminLesson } from "./api"

type LoadState =
  | { status: "loading" }
  | { status: "ok"; data: AdminContent }
  | { status: "unauthorized" }
  | { status: "forbidden" }
  | { status: "error" }

const eyebrow = "text-[0.8125rem] tracking-[0.08em] text-muted-foreground"
const note = "text-[0.95rem] opacity-[0.75]"
const statePage = `page-container py-10 ${note}`

/** 管理员内容管理：查看全部讲与讲义（含未上架）并切换上架状态。 */
export function AdminPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState({ status: "loading" })
    const result = await fetchAdminContent()
    setState(result.status === "ok" ? { status: "ok", data: result.data } : { status: result.status })
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(target: "lesson" | "handout", slug: string, listed: boolean) {
    const key = `${target}:${slug}`
    setPending(key)
    setMessage(null)
    const result = await setListing(target, slug, !listed)
    setPending(null)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    await load()
  }

  if (state.status === "loading") return <p className={statePage}>正在加载…</p>
  if (state.status === "unauthorized") {
    return (
      <p className={statePage}>
        请先
        <a className="underline" href="/login">
          登录
        </a>
        。
      </p>
    )
  }
  if (state.status === "forbidden") return <p className={statePage}>当前账号不是管理员，无法进入内容管理。</p>
  if (state.status === "error") return <p className={statePage}>加载失败，请刷新页面重试。</p>

  const { lessons, handouts } = state.data

  return (
    <main className="page-container py-10">
      <header className="grid gap-2">
        <p className={eyebrow}>管理员</p>
        <h1 className="text-section leading-tight">内容管理</h1>
        <p className={note}>上下架只影响访客可见性，不改内容本身；每次操作都会留下记录。</p>
      </header>
      <AdminMembershipPanel />
      <AdminCommentsPanel />
      <AdminSubmissionsPanel />

      {message ? (
        <p className={`my-4 ${note}`} role="alert">
          {message}
        </p>
      ) : null}

      <section className="mt-9 reading:mt-12" aria-labelledby="admin-lessons">
        <h2 id="admin-lessons" className="mb-3 text-[1.15rem]">
          讲（{lessons.length}）
        </h2>
        <ul className="flex flex-col gap-2">
          {lessons.map((lesson) => (
            <AdminRow
              key={lesson.slug}
              title={lesson.title}
              meta={`${lesson.courseTitle} / ${lesson.chapterTitle}`}
              listed={lesson.listed}
              pending={pending === `lesson:${lesson.slug}`}
              onToggle={() => void toggle("lesson", lesson.slug, lesson.listed)}
            />
          ))}
        </ul>
      </section>

      <section className="mt-9 reading:mt-12" aria-labelledby="admin-handouts">
        <h2 id="admin-handouts" className="mb-3 text-[1.15rem]">
          讲义（{handouts.length}）
        </h2>
        <ul className="flex flex-col gap-2">
          {handouts.map((handout) => (
            <AdminRow
              key={handout.slug}
              title={handout.title}
              meta={`考试科目 ${handout.subjectCode}`}
              listed={handout.listed}
              pending={pending === `handout:${handout.slug}`}
              onToggle={() => void toggle("handout", handout.slug, handout.listed)}
            />
          ))}
        </ul>
      </section>
    </main>
  )
}

function AdminRow(props: {
  title: AdminLesson["title"]
  meta: string
  listed: boolean
  pending: boolean
  onToggle: () => void
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[0.6rem] rounded-lg border border-border p-3 reading:grid-cols-[minmax(0,1fr)_auto_auto] reading:gap-3">
      <div className="min-w-0">
        <span className="block">{props.title}</span>
        <span className="block text-[0.85rem] opacity-[0.65]">{props.meta}</span>
      </div>
      <Badge variant={props.listed ? "secondary" : "outline"} className="justify-self-end reading:justify-self-auto">
        {props.listed ? "已上架" : "未上架"}
      </Badge>
      <Button
        type="button"
        variant="outline"
        className="col-span-2 min-h-11 w-full reading:col-span-1 reading:w-auto reading:min-w-[4.5rem]"
        disabled={props.pending}
        onClick={props.onToggle}
      >
        {props.pending ? "处理中…" : props.listed ? "下架" : "上架"}
      </Button>
    </li>
  )
}
