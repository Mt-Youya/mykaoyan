import { createFileRoute } from "@tanstack/react-router"
import { TopicProgressPage } from "../features/topic-progress"

export const Route = createFileRoute("/topic-progress")({
  head: () => ({ meta: [{ title: "考点进度 · 我的考研" }] }),
  component: TopicProgressPage,
})
