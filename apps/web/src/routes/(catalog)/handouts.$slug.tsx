import { createFileRoute } from "@tanstack/react-router"

import { HandoutPage } from "../../features/catalog"

export const Route = createFileRoute("/(catalog)/handouts/$slug")({
  head: () => ({ meta: [{ title: "讲义 · 我的考研" }] }),
  component: HandoutRoute,
})

function HandoutRoute() {
  const { slug } = Route.useParams()
  return <HandoutPage slug={slug} />
}
