import type { ProgressChangeSummary, ProgressFile } from "@mykaoyan/core"
import { useCallback, useEffect, useRef, useState } from "react"
import { fetchRevisions } from "./api"
import type { ProgressRevision } from "./api"
import { useProgress } from "./use-progress"
import { changeRows, countProgressRecords, parseProgressUpload, summarizeUpload } from "./upload"
import type { ProgressCounts } from "./upload"

type PendingUpload = { fileName: string; document: ProgressFile; summary: ProgressChangeSummary }

export type ProgressViewProps = {
  status: "loading" | "ready" | "unauthorized" | "error"
  document: ProgressFile | null
  etag: string | null
  message: string
  pending: PendingUpload | null
  uploadError: string
  revisions: ProgressRevision[]
  revisionsError: string
  busy: boolean
  onDownload: () => void
  onPickFile: (file: File) => void
  onConfirm: () => void
  onCancel: () => void
  onReload: () => void
}

const countLabels: Record<keyof ProgressCounts, string> = {
  profile: "备考档案",
  progress: "考点进度",
  mistakes: "错题",
  daily: "每日记录",
  dayPlans: "按天计划",
  weekly: "周复盘",
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function ChangeTable({ summary }: { summary: ProgressChangeSummary }) {
  const rows = changeRows(summary)
  if (rows.length === 0) return <p className="mt-3 text-muted-foreground">内容与云端一致，没有可上传的变更。</p>
  return (
    <table className="mt-3 w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th className="py-2 pr-4 font-medium">类别</th>
          <th className="py-2 pr-4 font-medium">新增</th>
          <th className="py-2 pr-4 font-medium">修改</th>
          <th className="py-2 font-medium">删除</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.category} className="border-b border-border">
            <td className="py-2 pr-4">{row.label}</td>
            <td className="py-2 pr-4">{row.added}</td>
            <td className="py-2 pr-4">{row.updated}</td>
            <td className="py-2">{row.removed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ReadyView(props: ProgressViewProps & { document: ProgressFile; etag: string }) {
  const counts = countProgressRecords(props.document)
  return (
    <>
      {props.message ? (
        <div role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
          <p>{props.message}</p>
          <button type="button" className="mt-2 underline underline-offset-4" onClick={props.onReload}>
            重新加载云端数据
          </button>
        </div>
      ) : null}

      <section className="grid gap-6 border-y border-border py-6 md:grid-cols-2">
        <div>
          <h2 className="text-section">当前版本</h2>
          <p className="mt-2 text-muted-foreground">
            第 {props.document.revision} 版 · {formatTime(props.document.updatedAt)}
          </p>
          <p className="mt-1 break-all text-sm text-muted-foreground">ETag：{props.etag}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {(Object.keys(countLabels) as (keyof ProgressCounts)[]).map((key) => (
            <div key={key} className="flex justify-between border-b border-border pb-1">
              <dt className="text-muted-foreground">{countLabels[key]}</dt>
              <dd>{counts[key]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-4">
        <h2 className="text-section">下载</h2>
        <p className="text-muted-foreground">下载整份进度文件；修改后从这里上传覆盖云端。</p>
        <button
          type="button"
          className="w-fit rounded-md border border-border px-4 py-2 hover:bg-muted"
          onClick={props.onDownload}
        >
          下载进度文件
        </button>
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <h2 className="text-section">上传</h2>
        <p className="text-muted-foreground">选择从本站下载的 JSON 文件，先看变更摘要，再确认上传。</p>
        <label className="w-fit cursor-pointer rounded-md border border-border px-4 py-2 hover:bg-muted">
          <span>选择进度文件（JSON）</span>
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="选择进度文件（JSON）"
            disabled={props.busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ""
              if (file) props.onPickFile(file)
            }}
          />
        </label>
        {props.uploadError ? (
          <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
            {props.uploadError}
          </p>
        ) : null}
        {props.pending ? (
          <div className="border border-border p-4">
            <p>
              待上传：<strong>{props.pending.fileName}</strong>
            </p>
            <ChangeTable summary={props.pending.summary} />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-60"
                disabled={props.busy}
                onClick={props.onConfirm}
              >
                {props.busy ? "正在上传…" : "确认上传"}
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-4 py-2 hover:bg-muted"
                disabled={props.busy}
                onClick={props.onCancel}
              >
                放弃
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 border-t border-border pt-6">
        <h2 className="text-section">历史版本</h2>
        {props.revisionsError ? (
          <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
            {props.revisionsError}
          </p>
        ) : props.revisions.length === 0 ? (
          <p className="text-muted-foreground">还没有历史版本。</p>
        ) : (
          <ol className="divide-y divide-border border-y border-border text-sm">
            {props.revisions.map((revision) => (
              <li key={revision.revision} className="flex justify-between py-3">
                <span>第 {revision.revision} 版</span>
                <span className="text-muted-foreground">{formatTime(revision.updatedAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}

export function ProgressView(props: ProgressViewProps) {
  return (
    <main className="page-container py-section">
      <div className="mx-auto grid max-w-[52rem] gap-8">
        <header className="border-b border-border pb-8">
          <p className="text-sm tracking-[0.08em] text-muted-foreground">账号数据</p>
          <h1 className="mt-4 font-serif text-hero">学习进度</h1>
          <p className="mt-5 text-muted-foreground">
            下载整份进度文件备份或迁移；上传前会先展示变更摘要。云端被其他设备改过时，上传会被拒绝。
          </p>
        </header>
        {props.status === "loading" ? (
          <p role="status">正在读取云端进度…</p>
        ) : props.status === "unauthorized" ? (
          <p>
            登录后查看和替换云端学习数据。
            <a className="underline underline-offset-4" href="/login">
              去登录
            </a>
          </p>
        ) : props.status === "error" || !props.document ? (
          <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
            {props.message || "学习数据暂不可用，请稍后重试。"}
          </p>
        ) : (
          <ReadyView {...props} document={props.document} etag={props.etag ?? ""} />
        )}
      </div>
    </main>
  )
}

function downloadProgress(document: ProgressFile) {
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = globalThis.document.createElement("a")
  anchor.href = url
  anchor.download = `mykaoyan-progress-v${document.revision}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ProgressPage() {
  const { status, document, etag, message, reload, save } = useProgress()
  const [pending, setPending] = useState<PendingUpload | null>(null)
  const [uploadError, setUploadError] = useState("")
  const [revisions, setRevisions] = useState<ProgressRevision[]>([])
  const [revisionsError, setRevisionsError] = useState("")
  const [busy, setBusy] = useState(false)
  const picking = useRef(false)

  const loadRevisions = useCallback(async () => {
    const result = await fetchRevisions()
    if (result.status === "ok") {
      setRevisions(result.revisions)
      setRevisionsError("")
    } else if (result.status === "error") {
      setRevisions([])
      setRevisionsError(result.message)
    }
  }, [])

  useEffect(() => {
    if (status === "ready") void loadRevisions()
  }, [status, loadRevisions])

  async function pickFile(file: File) {
    if (picking.current || !document) return
    picking.current = true
    setUploadError("")
    try {
      const parsed = parseProgressUpload(await file.text())
      if (!parsed.ok) {
        setPending(null)
        setUploadError(parsed.message)
        return
      }
      setPending({
        fileName: file.name,
        document: parsed.document,
        summary: summarizeUpload(document, parsed.document),
      })
    } catch {
      setPending(null)
      setUploadError("读取文件失败，请重新选择。")
    } finally {
      picking.current = false
    }
  }

  async function confirmUpload() {
    if (!pending || busy) return
    setBusy(true)
    setUploadError("")
    try {
      const saved = await save(pending.document)
      if (saved) {
        setPending(null)
        await reload()
        await loadRevisions()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <ProgressView
      status={status}
      document={document}
      etag={etag}
      message={message}
      pending={pending}
      uploadError={uploadError}
      revisions={revisions}
      revisionsError={revisionsError}
      busy={busy}
      onDownload={() => {
        if (document) downloadProgress(document)
      }}
      onPickFile={(file) => void pickFile(file)}
      onConfirm={() => void confirmUpload()}
      onCancel={() => setPending(null)}
      onReload={() => void reload()}
    />
  )
}
