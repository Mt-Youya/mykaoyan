import { createFileRoute } from "@tanstack/react-router"
import { ProgressPage } from "../features/progress"

export const Route = createFileRoute("/progress")({
  head: () => ({ meta: [{ title: "学习进度 · 我的考研" }] }),
  component: ProgressPage,
})
