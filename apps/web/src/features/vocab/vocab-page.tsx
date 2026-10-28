import { getVocabCounts, getVocabQueue, reviewVocabCard, toLocalDate, vocabDataSchema } from "@mykaoyan/core"
import type { VocabData } from "@mykaoyan/core"
import type { ChangeEvent, FormEvent } from "react"
import { useState } from "react"
import { Button, Input, Label } from "@mykaoyan/ui"
import { mergeVocabEntries, parsePastedVocab } from "./model"
import { useVocab } from "./use-vocab"

const buttonSize = "min-h-11 px-5 text-base"

function createId() {
  return crypto.randomUUID()
}

function downloadBackup(contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }))
  const link = document.createElement("a")
  link.href = url
  link.download = `mykaoyan-vocabulary-${toLocalDate(new Date())}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function VocabPage() {
  const { data, notice, save } = useVocab()
  const [source, setSource] = useState("")
  const [revealed, setRevealed] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [pendingBackup, setPendingBackup] = useState<VocabData | null>(null)
  const today = toLocalDate(new Date())

  if (!data)
    return (
      <main className="page-container py-section">
        <p role="status" className="text-muted-foreground">
          正在读取本机词表…
        </p>
      </main>
    )

  const vocab = data
  const queue = getVocabQueue(vocab, today)
  const current = queue[0] ?? null
  const counts = getVocabCounts(vocab, today)

  function importPasted(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const incoming = parsePastedVocab(source, createId)
      const merged = mergeVocabEntries(vocab.entries, incoming)
      if (!merged.added) return setMessage("这些词条已在本机词表中，无需重复导入。")
      if (save({ ...vocab, entries: merged.entries })) {
        setSource("")
        setError("")
        setMessage(`已导入 ${merged.added} 个词条。`)
      }
    } catch (cause) {
      setMessage("")
      setError(cause instanceof Error ? cause.message : "词表无法导入")
    }
  }

  function rate(grade: "again" | "hard" | "good" | "easy") {
    if (!current) return
    try {
      if (save(reviewVocabCard(vocab, current.entry.id, grade, today))) {
        setRevealed(false)
        setError("")
        setMessage("")
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "评分未保存")
    }
  }

  async function chooseBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    try {
      const parsed = vocabDataSchema.safeParse(JSON.parse(await file.text()))
      if (!parsed.success) throw new Error("这不是可识别的词表备份")
      setPendingBackup(parsed.data)
      setError("")
      setMessage("备份已读取。确认恢复后会替换当前浏览器中的词表、单词卡和复习记录。")
    } catch (cause) {
      setPendingBackup(null)
      setMessage("")
      setError(cause instanceof Error ? cause.message : "备份无法读取")
    }
  }

  return (
    <main className="page-container py-section">
      <div className="mx-auto grid max-w-[52rem] gap-10">
        <header className="border-b border-border pb-8">
          <p className="text-sm tracking-[0.08em] text-muted-foreground">我的学习 · 本机私有内容</p>
          <h1 className="mt-4 font-serif text-hero">背单词</h1>
          <p className="mt-5 max-w-[65ch] text-muted-foreground">
            词表、单词卡和复习记录只保存在这个浏览器，不会上传到账号。请定期下载备份；换设备时手动恢复。
          </p>
        </header>

        <section className="grid gap-5 border-y border-border py-8" aria-labelledby="vocab-review-title">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 id="vocab-review-title" className="text-section">
                今日复习
              </h2>
              <p className="mt-3 text-muted-foreground">到期卡清空后才会引入新卡；每天最多 30 张新卡。</p>
            </div>
            <p className="text-sm text-muted-foreground">
              到期 {counts.due} · 可引入新卡 {counts.newAvailable}
            </p>
          </div>
          {current ? (
            <div className="grid gap-6 border border-border bg-paper-soft p-6">
              <p className="text-sm text-muted-foreground">{current.card ? "到期卡" : "新卡"}</p>
              <p className="font-serif text-[clamp(2rem,5vw,3.25rem)] wrap-break-word" lang="en">
                {current.entry.term}
              </p>
              {revealed ? (
                <>
                  <p className="whitespace-pre-wrap text-lg leading-relaxed">{current.entry.meaning}</p>
                  <div className="flex flex-wrap gap-3" aria-label="为当前单词卡评分">
                    <Button className={buttonSize} variant="outline" onClick={() => rate("again")}>
                      忘记
                    </Button>
                    <Button className={buttonSize} variant="outline" onClick={() => rate("hard")}>
                      困难
                    </Button>
                    <Button className={buttonSize} onClick={() => rate("good")}>
                      记得
                    </Button>
                    <Button className={buttonSize} variant="outline" onClick={() => rate("easy")}>
                      轻松
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  className={`${buttonSize} justify-self-start`}
                  variant="outline"
                  onClick={() => setRevealed(true)}
                >
                  显示释义
                </Button>
              )}
            </div>
          ) : (
            <p className="border border-dashed border-border p-6 text-muted-foreground">
              {vocab.entries.length ? "今天的复习已完成。" : "还没有词表。请在下方导入自己的词条。"}
            </p>
          )}
        </section>

        <section className="grid gap-5" aria-labelledby="vocab-import-title">
          <div>
            <h2 id="vocab-import-title" className="text-section">
              导入自己的词表
            </h2>
            <p className="mt-3 text-muted-foreground">
              每行一个词条，用 Tab 分隔单词与释义。不会提供或下载任何第三方词书。
            </p>
          </div>
          <form className="grid gap-4" onSubmit={importPasted}>
            <Label className="flex-col items-stretch gap-2 text-base font-normal">
              词条
              <textarea
                className="min-h-44 w-full border border-input bg-note-paper p-3 leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder={"abandon\t放弃\nreview\t复习"}
                spellCheck={false}
              />
            </Label>
            <Button className={`${buttonSize} justify-self-start`} type="submit">
              导入词条
            </Button>
          </form>
        </section>

        <section className="grid gap-4 border-t border-border pt-8" aria-labelledby="vocab-backup-title">
          <div>
            <h2 id="vocab-backup-title" className="text-section">
              备份
            </h2>
            <p className="mt-3 text-muted-foreground">
              当前共有 {vocab.entries.length} 个词条。恢复备份会整体替换当前浏览器的私有词表数据。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              className={buttonSize}
              variant="outline"
              onClick={() => downloadBackup(`${JSON.stringify(vocab, null, 2)}\n`)}
            >
              下载备份
            </Button>
            <Label className="inline-flex min-h-11 cursor-pointer items-center border border-border px-5 text-base hover:bg-paper-soft">
              选择备份文件
              <Input className="sr-only" type="file" accept="application/json,.json" onChange={chooseBackup} />
            </Label>
            {pendingBackup && (
              <Button
                className={buttonSize}
                variant="destructive"
                onClick={() => {
                  if (save(pendingBackup)) {
                    setPendingBackup(null)
                    setMessage("已恢复备份。")
                  }
                }}
              >
                恢复并替换当前词表
              </Button>
            )}
          </div>
        </section>

        {(notice || error) && (
          <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
            {notice || error}
          </p>
        )}
        {message && (
          <p role="status" className="text-muted-foreground">
            {message}
          </p>
        )}

        {vocab.entries.length > 0 && (
          <section aria-labelledby="vocab-list-title">
            <h2 id="vocab-list-title" className="text-section">
              我的词表
            </h2>
            <ul className="mt-5 divide-y divide-border border-y border-border">
              {vocab.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="grid gap-1 py-4 reading:grid-cols-[minmax(12rem,0.6fr)_minmax(0,1fr)] reading:gap-8"
                >
                  <span lang="en" className="font-medium wrap-break-word">
                    {entry.term}
                  </span>
                  <span className="whitespace-pre-wrap text-muted-foreground">{entry.meaning}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
