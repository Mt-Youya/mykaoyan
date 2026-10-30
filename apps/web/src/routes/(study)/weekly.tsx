import { createFileRoute } from "@tanstack/react-router"

import { WeeklyPage } from "../../features/weekly"

export const Route = createFileRoute("/(study)/weekly")({
  head: () => ({ meta: [{ title: "周复盘 · 我的考研" }] }),
  component: WeeklyPage,
})
