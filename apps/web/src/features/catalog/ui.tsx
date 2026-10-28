import type { ReactNode } from "react"
import type { LoadState } from "./use-catalog"

/** 面包屑：只表达当前位置，链接用普通锚点即可。 */
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-4 text-sm wrap-break-word text-muted-foreground" aria-label="位置">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 && <span aria-hidden="true"> / </span>}
          {item.href ? (
            <a
              className="rounded-sm border-b border-transparent hover:border-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              href={item.href}
            >
              {item.label}
            </a>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

/**
 * 按加载状态渲染：loading 与错误状态只显示提示，404 不渲染任何内容数据。
 */
export function LoadGuard<T>({ state, children }: { state: LoadState<T>; children: (data: T) => ReactNode }) {
  if (state.status === "loading") {
    return (
      <p className="text-muted-foreground" role="status">
        正在加载…
      </p>
    )
  }
  if (state.status === "not-found") {
    return (
      <p className="text-muted-foreground" role="status">
        内容不存在或尚未上架。
      </p>
    )
  }
  if (state.status === "ok") {
    return <>{children(state.data)}</>
  }
  return (
    <p className="text-muted-foreground" role="alert">
      内容暂时无法加载，请稍后重试。
    </p>
  )
}
