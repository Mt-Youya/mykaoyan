import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { Button } from "@mykaoyan/ui"

import { favoriteFromInput, readFavorites, writeFavorites } from "../features/admissions"
import type { AdmissionFavorite } from "../features/admissions"
import { useStudyDraft } from "../features/profile"
import { TargetLookup } from "./-home/target-lookup"
import type { AdmissionFavoriteInput } from "./-home/target-lookup"

const display = (item: { code: string; name: string | null }) => [item.code, item.name].filter(Boolean).join(" ")
const mode = { full_time: "全日制", part_time: "非全日制" } as const

export function AdmissionsPage() {
  const { draft, ready, notice, save } = useStudyDraft()
  const [favorites, setFavorites] = useState<AdmissionFavorite[] | null>(null)
  const [comparing, setComparing] = useState<string[]>([])
  const [message, setMessage] = useState("")
  useEffect(() => {
    try {
      setFavorites(readFavorites(localStorage))
    } catch {
      setFavorites([])
      setMessage("本机收藏无法读取，原文件未改动。")
    }
  }, [])
  function persist(next: AdmissionFavorite[]) {
    try {
      writeFavorites(localStorage, next)
      setFavorites(next)
      return true
    } catch {
      setMessage("收藏未保存。请检查浏览器存储设置。")
      return false
    }
  }
  function favorite(input: AdmissionFavoriteInput) {
    if (!favorites) return
    const next = favoriteFromInput(draft?.year ?? new Date().getFullYear(), input.record, input.checkedAt)
    if (favorites.some((item) => item.id === next.id)) return setMessage("此招生条目已收藏。")
    if (persist([...favorites, next])) setMessage("已收藏招生条目。")
  }
  if (!ready)
    return (
      <main className="page-container py-section">
        <p role="status">正在读取本机备考草稿…</p>
      </main>
    )
  if (!draft)
    return (
      <main className="page-container py-section">
        <h1 className="font-serif text-hero">院校专业</h1>
        <p className="mt-5">请先在首页设置本机备考草稿，再查询和保存报考目标。</p>
        <a className="mt-5 inline-block underline underline-offset-4" href="/">
          返回首页
        </a>
      </main>
    )
  return (
    <main className="page-container py-section">
      <div className="mx-auto grid max-w-[52rem] gap-10">
        <header className="border-b border-border pb-8">
          <p className="text-sm tracking-[0.08em] text-muted-foreground">我的备考 · 本机草稿</p>
          <h1 className="mt-4 font-serif text-hero">院校专业</h1>
          <p className="mt-5 text-muted-foreground">
            当前目标：{draft.target.school || "未设置"}
            {draft.target.major ? ` · ${draft.target.major}` : ""}
            。查询结果来自研招网目录，选择后会写入当前浏览器的备考草稿。
          </p>
        </header>
        <section>
          <h2 className="text-section">收藏与比较</h2>
          {favorites === null ? (
            <p className="mt-4 text-muted-foreground">正在读取本机收藏…</p>
          ) : favorites.length === 0 ? (
            <p className="mt-4 text-muted-foreground">从下方查询结果中收藏招生条目后，可选择两项并排比较。</p>
          ) : (
            <>
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {favorites.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 py-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={comparing.includes(item.id)}
                        onChange={() =>
                          setComparing((current) =>
                            current.includes(item.id)
                              ? current.filter((id) => id !== item.id)
                              : current.length < 2
                                ? [...current, item.id]
                                : current,
                          )
                        }
                      />
                      比较
                    </label>
                    <div className="mr-auto">
                      <strong>
                        {display(item.unit)} · {display(item.major)}
                      </strong>
                      <p className="text-sm text-muted-foreground">
                        {display(item.college)} · {item.mode ? mode[item.mode] : "学习方式待核实"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        persist(favorites.filter((saved) => saved.id !== item.id))
                        setComparing((current) => current.filter((id) => id !== item.id))
                      }}
                    >
                      取消收藏
                    </Button>
                  </li>
                ))}
              </ul>
              {favorites.filter((item) => comparing.includes(item.id)).length === 2 && (
                <div className="mt-5 grid gap-4 reading:grid-cols-2">
                  {favorites
                    .filter((item) => comparing.includes(item.id))
                    .map((item) => (
                      <article key={item.id} className="border border-border p-5">
                        <h3 className="font-serif text-xl">{display(item.unit)}</h3>
                        <p className="mt-2">
                          {display(item.college)} · {display(item.major)}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {display(item.direction)} · {item.mode ? mode[item.mode] : "学习方式待核实"}
                        </p>
                        <p className="mt-3 text-sm">
                          {item.groups.map((group) => group.subjects.map(display).join(" + ")).join(" 或 ")}
                        </p>
                        {item.sourceUrl && (
                          <a
                            className="mt-3 inline-block underline underline-offset-4"
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            核对研招网来源
                          </a>
                        )}
                      </article>
                    ))}
                </div>
              )}
            </>
          )}
        </section>
        <section className="border-t border-border pt-8">
          <h2 className="text-section">查询招生目录</h2>
          <div className="mt-6">
            <TargetLookup
              year={draft.year}
              onApply={(selection) => {
                save({
                  ...draft,
                  target: selection.target,
                  subjects: selection.subjects,
                  active: selection.subjects.map((subject) => subject.code),
                  source: selection.source,
                })
              }}
              onFavorite={favorite}
            />
          </div>
        </section>
        {(notice || message) && (
          <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
            {notice || message}
          </p>
        )}
      </div>
    </main>
  )
}

export const Route = createFileRoute("/admissions")({
  head: () => ({ meta: [{ title: "院校专业 · 我的考研" }] }),
  component: AdmissionsPage,
})
