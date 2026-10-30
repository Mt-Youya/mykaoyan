import { createFileRoute } from "@tanstack/react-router"

import { DailyPage } from "../../features/daily"

export const Route = createFileRoute("/(study)/daily")({
  head: () => ({ meta: [{ title: "每日记录 · 我的考研" }] }),
  component: DailyPage,
})
