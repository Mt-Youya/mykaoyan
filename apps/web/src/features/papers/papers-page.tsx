import { Button, Input, Label } from "@mykaoyan/ui"
import { z } from "zod"
import type { FormEvent } from "react"
import { useEffect, useState } from "react"

const storageKey = "mykaoyan.paper-index-v1"
const paperSchema = z.object({
  id: z.string().min(1),
  subject: z.string().regex(/^\d{3}$/),
  year: z.number().int().min(1978).max(2100),
  source: z.string().trim().min(1),
  privateNote: z.string(),
})
const papersSchema = z.array(paperSchema)
type Paper = z.infer<typeof paperSchema>

export function PapersPage() {
  const [papers, setPapers] = useState<Paper[] | null>(null)
  const [message, setMessage] = useState("")
  const [subject, setSubject] = useState("302")
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [source, setSource] = useState("")
  const [privateNote, setPrivateNote] = useState("")

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      setPapers(raw === null ? [] : papersSchema.parse(JSON.parse(raw)))
    } catch {
      setPapers([])
      setMessage("本机试卷索引无法读取，已保留原文件。")
    }
  }, [])

  function persist(next: Paper[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(papersSchema.parse(next)))
      setPapers(next)
      return true
    } catch {
      setMessage("试卷索引未保存。请检查浏览器存储设置。")
      return false
    }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!papers) return
    const parsed = paperSchema.safeParse({ id: crypto.randomUUID(), subject, year: Number(year), source, privateNote })
    if (!parsed.success) return setMessage("请填写三位科目代码、年份和题目来源。")
    if (persist([...papers, parsed.data])) {
      setSource("")
      setPrivateNote("")
      setMessage("")
    }
  }

  return (
    <main className="page-container py-section">
      <div className="mx-auto grid max-w-[52rem] gap-10">
        <header className="border-b border-border pb-8">
          <p className="text-sm tracking-[0.08em] text-muted-foreground">我的学习 · 本机私有内容</p>
          <h1 className="mt-4 font-serif text-hero">试卷</h1>
          <p className="mt-5 text-muted-foreground">
            公共部分只应提供来源索引；这里登记你自己拥有的试卷与笔记，不会上传或公开题面、答案。
          </p>
        </header>
        {papers === null ? (
          <p role="status">正在读取本机试卷索引…</p>
        ) : (
          <>
            <form className="grid gap-4 border-y border-border py-8" onSubmit={add}>
              <h2 className="text-section">登记自己的试卷</h2>
              <div className="grid gap-4 reading:grid-cols-2">
                <Label className="flex-col items-stretch gap-2">
                  考试科目代码
                  <Input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    pattern="\\d{3}"
                    required
                  />
                </Label>
                <Label className="flex-col items-stretch gap-2">
                  年份
                  <Input value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" required />
                </Label>
              </div>
              <Label className="flex-col items-stretch gap-2">
                来源或本机文件位置
                <Input
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="例如：自己购买的 2024 数学二试卷"
                  required
                />
              </Label>
              <Label className="flex-col items-stretch gap-2">
                私有笔记（可选）
                <textarea
                  className="min-h-28 border border-input bg-note-paper p-3"
                  value={privateNote}
                  onChange={(event) => setPrivateNote(event.target.value)}
                />
              </Label>
              <Button className="min-h-11 justify-self-start px-5 text-base" type="submit">
                加入索引
              </Button>
            </form>
            <section>
              <h2 className="text-section">我的试卷索引</h2>
              {papers.length === 0 ? (
                <p className="mt-5 text-muted-foreground">还没有登记试卷。</p>
              ) : (
                <ul className="mt-5 divide-y divide-border border-y border-border">
                  {papers
                    .toSorted((a, b) => b.year - a.year)
                    .map((paper) => (
                      <li key={paper.id} className="py-4">
                        <strong>
                          {paper.subject} · {paper.year}
                        </strong>
                        <p className="mt-1 text-muted-foreground">{paper.source}</p>
                        {paper.privateNote && <p className="mt-2 whitespace-pre-wrap">{paper.privateNote}</p>}
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
