import { createFileRoute } from "@tanstack/react-router"

import { SubjectPage } from "../features/catalog"

export const Route = createFileRoute("/subjects/$code")({
  head: () => ({ meta: [{ title: "课程与讲义 · 我的考研" }] }),
  component: SubjectRoute,
})

function SubjectRoute() {
  const { code } = Route.useParams()
  return <SubjectPage code={code} />
}
