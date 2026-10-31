import { createFileRoute } from "@tanstack/react-router"

import { PaperPage } from "../../features/exams"

export const Route = createFileRoute("/(community)/community/papers/$slug")({
  head: () => ({ meta: [{ title: "用户投稿试卷 · 我的考研" }] }),
  component: PaperRoute,
})

function PaperRoute() {
  const { slug } = Route.useParams()
  return <PaperPage slug={slug} community />
}
