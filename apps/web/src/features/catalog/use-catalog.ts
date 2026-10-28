import { useEffect, useState } from "react"
import { fetchCatalog } from "./api"
import type { ApiResult } from "./api"

/** 页面加载状态；SSR 先渲染 loading，浏览器挂载后才发请求。 */
export type LoadState<T> = { status: "loading" } | ApiResult<T>

export function useCatalog<T>(path: string): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: "loading" })
    void fetchCatalog<T>(path, controller.signal).then((result) => {
      if (!controller.signal.aborted) setState(result)
    })
    return () => controller.abort()
  }, [path])

  return state
}
