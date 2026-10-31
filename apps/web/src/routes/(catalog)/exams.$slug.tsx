import { PaperPage } from "@/features/exams"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/(catalog)/exams/$slug")({
  head: () => ({ meta: [{ title: "真题试卷 · 我的考研" }] }),
  component: PaperRoute,
})

function PaperRoute() {
  const { slug } = Route.useParams()
  return <PaperPage slug={slug} />
}
