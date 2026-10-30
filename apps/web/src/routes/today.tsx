import { createFileRoute } from "@tanstack/react-router"

import { TodayPage } from "../features/today"

export const Route = createFileRoute("/today")({
  head: () => ({ meta: [{ title: "今日页 · 我的考研" }] }),
  component: TodayPage,
})
