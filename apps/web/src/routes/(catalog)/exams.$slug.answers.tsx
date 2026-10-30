import { createFileRoute } from "@tanstack/react-router"

import { PaperAnswersPage } from "../../features/exams"

export const Route = createFileRoute("/(catalog)/exams/$slug/answers")({
  head: () => ({
    meta: [{ title: "答案与解析 · 我的考研" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AnswersRoute,
})

function AnswersRoute() {
  const { slug } = Route.useParams()
  return <PaperAnswersPage slug={slug} />
}
