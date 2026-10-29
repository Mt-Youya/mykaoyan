import { getRetestState, isRetestDue, publicTopics, recordRetest, toLocalDate } from "@mykaoyan/core"
import type { LocalDate, Mistake, MistakeCause, RetestResult } from "@mykaoyan/core"
import { Button, Input, Label } from "@mykaoyan/ui"
import type { FormEvent } from "react"
import { useState } from "react"
import { useProgress } from "../progress"

const causes: { value: MistakeCause; label: string }[] = [
  { value: "concept", label: "概念" },
  { value: "condition", label: "条件" },
  { value: "calculation", label: "计算" },
  { value: "evidence", label: "依据" },
  { value: "misread", label: "审题" },
  { value: "strategy", label: "策略" },
]

const button = "min-h-11 px-5 text-base"

function Gate({ status, message }: { status: string; message: string }) {
  if (status === "loading") return <p role="status">正在读取云端学习数据…</p>
  if (status === "unauthorized")
    return (
      <p>
        错题和复测会同步到账号。请先{" "}
        <a className="underline underline-offset-4" href="/login">
          登录账号
        </a>
        。
      </p>
    )
  return (
    <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
      {message}
    </p>
  )
}

type MistakeItemProps = {
  mistake: Mistake
  today: LocalDate
  onRetest: (result: RetestResult) => void
}

/** 单条错题与复测状态；复测按钮只在到期时出现，稳定后不再显示。 */
export function MistakeItem({ mistake, today, onRetest }: MistakeItemProps) {
  const state = getRetestState(mistake, today)
  return (
    <li className="grid gap-4 py-5">
      <div>
        <p className="text-sm text-muted-foreground">
          {mistake.subject} · {mistake.source || "未标注来源"}
          {mistake.topicId ? ` · 考点 ${mistake.topicId}` : ""}
        </p>
        <p className="mt-2 whitespace-pre-wrap">{mistake.questionMd}</p>
        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">订正：{mistake.correctionMd}</p>
      </div>
      {state.stable ? (
        <p className="text-sm text-muted-foreground">已稳定：两次复测均独立完成。</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            第 {state.attempt} 次复测 · {state.overdueDays ? `逾期 ${state.overdueDays} 天` : `计划 ${state.nextOn}`}
          </p>
          {isRetestDue(state, today) &&
            (
              [
                ["independent", "独立完成"],
                ["with-hint", "提示后完成"],
                ["failed", "不会"],
              ] as const
            ).map(([result, label]) => (
              <Button
                key={result}
                className={button}
                variant={result === "independent" ? "default" : "outline"}
                onClick={() => onRetest(result)}
              >
                {label}
              </Button>
            ))}
        </div>
      )}
    </li>
  )
}

export function MistakesPage() {
  const { status, document, message, save } = useProgress()
  const [subject, setSubject] = useState("302")
  const [topicId, setTopicId] = useState("")
  const [source, setSource] = useState("")
  const [questionMd, setQuestionMd] = useState("")
  const [correctionMd, setCorrectionMd] = useState("")
  const [cause, setCause] = useState<MistakeCause>("concept")
  const today = toLocalDate(new Date())

  async function createMistake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!document || !/^\d{3}$/.test(subject)) return
    const next = {
      ...document,
      data: {
        ...document.data,
        mistakes: [
          ...document.data.mistakes,
          {
            id: crypto.randomUUID(),
            subject,
            ...(topicId ? { topicId } : {}),
            source,
            questionMd,
            correctionMd,
            causes: [cause],
            correctedOn: today,
            retests: [],
            createdAt: new Date().toISOString(),
          },
        ],
      },
    }
    if (await save(next)) {
      setSource("")
      setQuestionMd("")
      setCorrectionMd("")
      setTopicId("")
    }
  }

  async function retest(id: string, result: RetestResult) {
    if (!document) return
    const next = {
      ...document,
      data: {
        ...document.data,
        mistakes: document.data.mistakes.map((mistake) =>
          mistake.id === id ? recordRetest(mistake, result, today) : mistake
        ),
      },
    }
    await save(next)
  }

  return (
    <main className="page-container py-section">
      <div className="mx-auto grid max-w-[52rem] gap-10">
        <header className="border-b border-border pb-8">
          <p className="text-sm tracking-[0.08em] text-muted-foreground">我的学习 · 云端私有数据</p>
          <h1 className="mt-4 font-serif text-hero">错题与复测</h1>
          <p className="mt-5 text-muted-foreground">
            题面、作答和订正只在登录后的个人学习数据中保存，不会出现在公共试卷索引里。
          </p>
        </header>
        {status !== "ready" || !document ? (
          <Gate status={status} message={message || "学习数据暂不可用，请稍后重试。"} />
        ) : (
          <>
            <form className="grid gap-4 border-y border-border py-8" onSubmit={createMistake}>
              <h2 className="text-section">记录一道错题</h2>
              <div className="grid gap-4 reading:grid-cols-2">
                <Label className="flex-col items-stretch gap-2">
                  考试科目代码
                  <Input
                    value={subject}
                    onChange={(event) => {
                      setSubject(event.target.value)
                      setTopicId("")
                    }}
                    pattern="[0-9]{3}"
                    required
                  />
                </Label>
                <Label className="flex-col items-stretch gap-2">
                  题目来源
                  <Input
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder="例如自己的练习册页码"
                    required
                  />
                </Label>
              </div>
              <Label className="flex-col items-stretch gap-2">
                关联考点（可选）
                <select
                  className="min-h-11 border border-input bg-background px-3"
                  value={topicId}
                  onChange={(event) => setTopicId(event.target.value)}
                >
                  <option value="">不关联考点</option>
                  {publicTopics
                    .filter((topic) => topic.subject === subject)
                    .map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.id} · {topic.title}
                      </option>
                    ))}
                </select>
              </Label>
              <Label className="flex-col items-stretch gap-2">
                题目与作答摘要
                <textarea
                  className="min-h-28 border border-input bg-note-paper p-3"
                  value={questionMd}
                  onChange={(event) => setQuestionMd(event.target.value)}
                  required
                />
              </Label>
              <Label className="flex-col items-stretch gap-2">
                订正
                <textarea
                  className="min-h-28 border border-input bg-note-paper p-3"
                  value={correctionMd}
                  onChange={(event) => setCorrectionMd(event.target.value)}
                  required
                />
              </Label>
              <Label className="flex-col items-stretch gap-2">
                主要错因
                <select
                  className="min-h-11 border border-input bg-background px-3"
                  value={cause}
                  onChange={(event) => setCause(event.target.value as MistakeCause)}
                >
                  {causes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Label>
              <Button className={`${button} justify-self-start`} type="submit">
                保存错题
              </Button>
            </form>
            <section aria-labelledby="mistake-list-title">
              <h2 id="mistake-list-title" className="text-section">
                我的错题
              </h2>
              {document.data.mistakes.length === 0 ? (
                <p className="mt-5 text-muted-foreground">还没有错题记录。</p>
              ) : (
                <ul className="mt-5 divide-y divide-border border-y border-border">
                  {document.data.mistakes
                    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((mistake) => (
                      <MistakeItem
                        key={mistake.id}
                        mistake={mistake}
                        today={today}
                        onRetest={(result) => void retest(mistake.id, result)}
                      />
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
