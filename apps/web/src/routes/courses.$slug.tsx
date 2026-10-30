import { createFileRoute } from "@tanstack/react-router"

import { CoursePage } from "../features/catalog"

export const Route = createFileRoute("/courses/$slug")({
  head: () => ({ meta: [{ title: "课程 · 我的考研" }] }),
  component: CourseRoute,
})

function CourseRoute() {
  const { slug } = Route.useParams()
  return <CoursePage slug={slug} />
}
