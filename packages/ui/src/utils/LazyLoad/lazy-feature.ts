import { lazy, type ComponentType, type LazyExoticComponent } from "react"

/**
 * 通用懒加载工厂：把「模块路径 + 导出名」变成 React.lazy 组件，自动保留 Props 类型。
 *
 * 用法：
 *   const OverviewPage = lazyFeature(() => import("@/features/overview/OverviewPage"), "OverviewPage")
 *
 * 说明：
 * - import() 必须写在调用点（Vite 依赖静态可分析的动态 import 来切 chunk，不能收进工厂内部）
 * - 返回标准 React.lazy 组件，外层用 <Suspense> 包裹即可
 * - Props 类型从模块导出自动推断，调用处类型检查与静态 import 完全一致
 */
type ComponentOf<M, K extends keyof M> = M[K] extends ComponentType<infer P> ? ComponentType<P> : never

export function lazyFeature<M extends Record<string, unknown>, K extends keyof M>(
  loader: () => Promise<M>,
  exportName: K
): LazyExoticComponent<ComponentOf<M, K>> {
  const factory = lazy(async () => {
    const mod = await loader()
    return { default: mod[exportName] as ComponentType<unknown> }
  })
  return factory as LazyExoticComponent<ComponentOf<M, K>>
}
