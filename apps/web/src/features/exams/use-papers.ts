import { useEffect, useState } from "react"

import { fetchPapers } from "./api"
import type { PapersState } from "./api"

/** 试卷数据加载：SSR 先渲染 loading，浏览器挂载后请求公开接口。 */
export function usePapers<T>(path: string): PapersState<T> {
  const [state, setState] = useState<PapersState<T>>({ status: "loading" })
  useEffect(() => {
    const controller = new AbortController()
    setState({ status: "loading" })
    void fetchPapers<T>(path, controller.signal).then((result) => {
      if (!controller.signal.aborted) setState(result)
    })
    return () => controller.abort()
  }, [path])
  return state
}
