import { type PropsWithChildren, Suspense } from "react"

import { Skeleton } from "../../base/index.ts"

export function LazyLoad({ children }: PropsWithChildren) {
  return <Suspense fallback={<Skeleton />}>{children}</Suspense>
}
