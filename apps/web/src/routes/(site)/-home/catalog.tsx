import { Button } from "@mykaoyan/ui"

import type { LoadState } from "../../../features/catalog"

type Entry = { slug: string; title: string; summary?: string }

type Props = {
  kind: "courses" | "handouts"
  subject: string
  states: Record<string, LoadState<Entry[]>>
  labels?: Record<string, string>
}

const entryRow =
  "grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-border py-6 reading:grid-cols-[4.5rem_minmax(0,1fr)] reading:gap-x-6"
const entryRowWithAction = `${entryRow} reading:grid-cols-[4.5rem_minmax(0,1fr)_auto]`
const entryLink = "col-start-2 inline-flex min-h-11 items-center justify-self-start underline"
const retryButton = "mt-4 min-h-12 px-6 text-base"

export function CatalogEntries({ kind, subject, states, labels }: Props) {
  const codes = subject === "all" ? Object.keys(states) : [subject]
  const selected = codes.map((code) => states[code] ?? { status: "invalid" })
  const label = kind === "courses" ? "课程" : "讲义"

  if (selected.some((state) => state.status !== "ok" && state.status !== "loading")) {
    return (
      <div className="border-t border-border py-6">
        <p role="alert" className="text-muted-foreground">
          {label}暂时无法加载，请稍后重试。
        </p>
        <Button variant="outline" className={retryButton} onClick={() => window.location.reload()}>
          重新加载
        </Button>
      </div>
    )
  }
  if (selected.some((state) => state.status === "loading")) {
    return (
      <p className="border-t border-border py-6 text-muted-foreground" role="status">
        正在加载{label}…
      </p>
    )
  }

  const entries = codes.flatMap((code) => {
    const state = states[code]
    return state?.status === "ok" ? state.data.map((entry) => ({ entry, code })) : []
  })
  if (entries.length === 0) {
    return (
      <p className="border-t border-border py-6 text-muted-foreground" role="status">
        这个科目范围内还没有已上架的{label}。
      </p>
    )
  }

  return (
    <ul>
      {entries.map(({ entry, code }) => (
        <li key={`${code}-${entry.slug}`} className={kind === "handouts" ? entryRowWithAction : entryRow}>
          <span className="pt-2 text-sm text-muted-foreground">
            {labels?.[code] ?? (code === "302" ? "数学二" : code)}
          </span>
          <div>
            <h3 className="text-[1.45rem]">
              <a className="block py-1 hover:underline" href={`/${kind}/${encodeURIComponent(entry.slug)}`}>
                {entry.title}
              </a>
            </h3>
            {entry.summary && <p className="mt-2 text-muted-foreground">{entry.summary}</p>}
          </div>
          <a
            className={kind === "handouts" ? `${entryLink} reading:col-start-3` : entryLink}
            href={`/${kind}/${encodeURIComponent(entry.slug)}`}
          >
            查看{label}
            <span className="sr-only">：{entry.title}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
