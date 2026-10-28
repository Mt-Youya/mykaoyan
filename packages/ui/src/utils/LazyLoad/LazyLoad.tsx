import { Skeleton } from "../../base/index.ts"
import { type PropsWithChildren, Suspense } from "react"

export function LazyLoad({ children }: PropsWithChildren) {
  return <Suspense fallback={<Skeleton />}>{children}</Suspense>
}
