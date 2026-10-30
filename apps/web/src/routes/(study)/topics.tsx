import { createFileRoute } from "@tanstack/react-router"

import { TopicsPage } from "../../features/topics"

export const Route = createFileRoute("/(study)/topics")({
  head: () => ({ meta: [{ title: "专题 · 我的考研" }] }),
  component: TopicsPage,
})
