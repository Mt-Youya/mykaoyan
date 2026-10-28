import type { ProgressFile } from "@mykaoyan/core"
import { useCallback, useEffect, useState } from "react"
import { fetchProgress, saveProgress } from "./api"

export type ProgressState = {
  status: "loading" | "ready" | "unauthorized" | "error"
  document: ProgressFile | null
  message: string
}

export function useProgress() {
  const [state, setState] = useState<ProgressState>({ status: "loading", document: null, message: "" })
  const [etag, setEtag] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, status: "loading", message: "" }))
    const result = await fetchProgress()
    if (result.status === "ok") {
      setEtag(result.etag)
      setState({ status: "ready", document: result.document, message: "" })
    } else if (result.status === "unauthorized") setState({ status: "unauthorized", document: null, message: "" })
    else setState({ status: "error", document: null, message: result.message })
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(
    async (next: ProgressFile) => {
      if (!etag) return false
      const result = await saveProgress(next, etag)
      if (result.status === "conflict") {
        setState((current) => ({ ...current, message: "另一处已更新学习数据。请刷新后再修改，本次内容没有上传。" }))
        return false
      }
      if (result.status === "error") {
        setState((current) => ({ ...current, message: result.message }))
        return false
      }
      setEtag(result.etag)
      setState({
        status: "ready",
        document: { ...next, revision: next.revision + 1, updatedBy: "site", updatedAt: new Date().toISOString() },
        message: "",
      })
      return true
    },
    [etag]
  )

  return { ...state, reload, save }
}
