import { type ComponentType, lazy } from "react"

import { LazyLoad } from "./LazyLoad"

/**
 * 通用懒加载模块工厂：把「一个组件文件」整体变成一组自带 Suspense 的 lazy 组件。
 *
 * 用法（聚合入口里每个组件文件一行）：
 *   export const { Accordion, AccordionItem, AccordionTrigger, AccordionContent } =
 *     lazyModule(() => import("./accordion"))
 *
 * 说明：
 * - import() 必须写在调用点（Vite 依赖静态可分析的动态 import 来切 chunk，不能收进工厂内部）
 * - 每个导出都是真正的组件，可直接 <Accordion />；Props 类型从模块导出自动推断，
 *   调用处类型检查与静态 import 完全一致
 * - Suspense（<LazyLoad>，Skeleton fallback）包在组件内部：单独渲染任何一个导出
 *   都自带边界，不需要调用方再包一层
 * - 导出名编译期可知、值要等 import() 才有，所以运行期用 Proxy 按访问到的 key
 *   惰性创建并缓存：同一导出多次取到同一个组件，不会因父组件重渲染而重挂载
 * - 文件里的非组件导出（hook、常量）在类型上映射为 never，解构它们会直接报类型错误
 */
type LazyModule<M> = {
  [K in keyof M]: M[K] extends ComponentType<infer Props> ? ComponentType<Props> : never
}

/** 给单个 lazy 组件包上 Suspense（Skeleton fallback），得到可直接渲染、自带加载态的组件。 */
function withSuspense(
  Lazy: ComponentType<Record<string, unknown>>,
  name: string,
): ComponentType<Record<string, unknown>> {
  // 组件工厂模式：WithSuspense 必须闭包住按 key 创建的 Lazy，无法提升到模块层
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- false positive: it closes over `Lazy`
  function WithSuspense(props: Record<string, unknown>) {
    return (
      <LazyLoad>
        <Lazy {...props} />
      </LazyLoad>
    )
  }
  WithSuspense.displayName = `Lazy(${name})`
  return WithSuspense
}

export function lazyModule<M extends Record<string, unknown>>(loader: () => Promise<M>): LazyModule<M> {
  const cache = new Map<string, ComponentType<Record<string, unknown>>>()

  return new Proxy({} as LazyModule<M>, {
    get(_target, key) {
      if (typeof key !== "string") return undefined
      let component = cache.get(key)
      if (!component) {
        const Lazy = lazy(async () => ({ default: (await loader())[key] as ComponentType<Record<string, unknown>> }))
        component = withSuspense(Lazy, key)
        cache.set(key, component)
      }
      return component
    },
  })
}
