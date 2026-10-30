import { type PropsWithChildren, Suspense } from "react"

import { Skeleton } from "../../base"

export function LazyLoad({ children }: PropsWithChildren) {
  return <Suspense fallback={<Skeleton />}>{children}</Suspense>
}
