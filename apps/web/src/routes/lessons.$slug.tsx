import { createFileRoute } from "@tanstack/react-router"
import { LessonPage } from "../features/catalog"

export const Route = createFileRoute("/lessons/$slug")({
  head: () => ({ meta: [{ title: "讲 · 我的考研" }] }),
  component: LessonRoute,
})

function LessonRoute() {
  const { slug } = Route.useParams()
  return <LessonPage slug={slug} />
}
