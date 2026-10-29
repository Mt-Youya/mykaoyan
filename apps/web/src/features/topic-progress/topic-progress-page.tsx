import { getTopicProgressList, publicTopics } from "@mykaoyan/core"
import type { ProgressFile, TopicManualState } from "@mykaoyan/core"
import { Button } from "@mykaoyan/ui"
import { useProgress } from "../progress"

const buttonSize = "min-h-10 px-4 text-sm"

const manualLabels: { value: TopicManualState; label: string }[] = [
  { value: "untested", label: "未测" },
  { value: "learning", label: "学习中" },
  { value: "practiced", label: "已练" },
]

const stateLabels = {
  untested: "未测",
  learning: "学习中",
  practiced: "已练",
  retest: "待重测（有未稳定错题）",
  stable: "稳定（关联错题都已稳定）",
} as const

export type TopicProgressViewProps = {
  status: "loading" | "ready" | "unauthorized" | "error"
  document: ProgressFile | null
  message: string
  onSetManual: (topicId: string, manual: TopicManualState) => void
}

function Gate({ status, message }: { status: TopicProgressViewProps["status"]; message: string }) {
  if (status === "loading") return <p role="status">正在读取云端学习数据…</p>
  if (status === "unauthorized")
    return (
      <p>
        考点进度会同步到账号。请先{" "}
        <a className="underline underline-offset-4" href="/login">
          登录账号
        </a>
        。
      </p>
    )
  return (
    <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
      {message || "学习数据暂不可用，请稍后重试。"}
    </p>
  )
}

/** 考点进度：手动只设到已练；待重测与稳定由关联错题推算，不能手动设定。 */
export function TopicProgressView({ status, document, message, onSetManual }: TopicProgressViewProps) {
  if (status !== "ready" || !document) {
    return (
      <main className="page-container py-section">
        <div className="mx-auto max-w-[52rem]">
          <h1 className="font-serif text-hero">考点进度</h1>
          <div className="mt-6">
            <Gate status={status} message={message} />
          </div>
        </div>
      </main>
    )
  }

  const profile = document.data.profile
  if (!profile) {
    return (
      <main className="page-container py-section">
        <div className="mx-auto grid max-w-[52rem] gap-6">
          <h1 className="font-serif text-hero">考点进度</h1>
          <p className="border border-dashed border-border p-6">还没有备考档案。建立档案后，按所考科目列出考点。</p>
          <a className="underline underline-offset-4" href="/plan">
            去建立备考档案
          </a>
        </div>
      </main>
    )
  }

  const subjects = profile.subjects.map((subject) => subject.code)
  const subjectCodes = new Set(subjects)
  const topics = publicTopics.filter((topic) => subjectCodes.has(topic.subject))
  const items = getTopicProgressList(topics, document.data.progress, document.data.mistakes)
  const groups = profile.subjects
    .map((subject) => ({ subject, items: items.filter((item) => item.topic.subject === subject.code) }))
    .filter((group) => group.items.length > 0)

  return (
    <main className="page-container py-section">
      <div className="mx-auto grid max-w-[52rem] gap-10">
        <header className="border-b border-border pb-8">
          <p className="text-sm tracking-[0.08em] text-muted-foreground">我的学习 · 云端私有数据</p>
          <h1 className="mt-4 font-serif text-hero">考点进度</h1>
          <p className="mt-5 max-w-[65ch] text-muted-foreground">
            你只能手动设置未测、学习中、已练；已练之后由关联错题推算待重测或稳定。稳定不能手动设定。
          </p>
        </header>

        {groups.length === 0 ? (
          <p className="border border-dashed border-border p-6">当前科目的考点表还没有内容。</p>
        ) : (
          groups.map((group) => (
            <section key={group.subject.code} aria-labelledby={`topic-${group.subject.code}`}>
              <h2 id={`topic-${group.subject.code}`} className="border-b border-border pb-3 text-section">
                {group.subject.code} · {group.subject.name}
              </h2>
              <ul className="divide-y divide-border border-b border-border">
                {group.items.map(({ topic, state }) => (
                  <li
                    key={topic.id}
                    className="grid gap-3 py-4 reading:grid-cols-[9rem_minmax(0,1fr)_auto] reading:items-center"
                  >
                    <span className="tabular-nums text-muted-foreground">
                      {topic.id}
                      {topic.part ? ` · ${topic.part}` : ""}
                    </span>
                    <div>
                      <p className="font-medium">{topic.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{stateLabels[state]}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {manualLabels.map(({ value, label }) => (
                        <Button
                          key={value}
                          className={buttonSize}
                          variant="outline"
                          aria-pressed={
                            document.data.progress.find((item) => item.topicId === topic.id)?.manual === value
                          }
                          onClick={() => onSetManual(topic.id, value)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {message && (
          <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
            {message}
          </p>
        )}
      </div>
    </main>
  )
}

export function TopicProgressPage() {
  const { status, document, message, save } = useProgress()

  async function setManual(topicId: string, manual: TopicManualState) {
    if (!document) return
    const updatedAt = new Date().toISOString()
    const exists = document.data.progress.some((item) => item.topicId === topicId)
    const progress = exists
      ? document.data.progress.map((item) => (item.topicId === topicId ? { ...item, manual, updatedAt } : item))
      : [...document.data.progress, { topicId, manual, updatedAt }]
    await save({ ...document, data: { ...document.data, progress } })
  }

  return (
    <TopicProgressView
      status={status}
      document={document}
      message={message}
      onSetManual={(topicId, manual) => void setManual(topicId, manual)}
    />
  )
}
