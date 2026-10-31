import { useState } from "react"

import { Button } from "@mykaoyan/ui"

import { Markdown } from "../catalog"
import { fetchManuscript } from "./api"
/** 按需读取并渲染手稿正文；列表与卡片只显示摘要与字节数，不加载全文。 */
export function ManuscriptReader({ submissionId, disabled = false }: { submissionId: string; disabled?: boolean }) {
  const [markdown, setMarkdown] = useState<string | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("")
  async function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    if (markdown !== null) {
      setOpen(true)
      return
    }
    setBusy(true)
    setMessage("")
    try {
      setMarkdown(await fetchManuscript(submissionId))
      setOpen(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "手稿读取失败")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <Button
        className="min-h-11 self-start"
        type="button"
        variant="outline"
        disabled={disabled || busy}
        aria-expanded={open}
        onClick={() => void toggle()}
      >
        {disabled ? "手稿不可读" : busy ? "正在读取手稿…" : open ? "收起手稿" : "阅读手稿"}
      </Button>
      {message ? <p role="alert">{message}</p> : null}
      {open && markdown !== null ? (
        <div className="border border-border pbs-2" aria-label="手稿正文">
          <Markdown markdown={markdown} />
        </div>
      ) : null}
    </div>
  )
}
