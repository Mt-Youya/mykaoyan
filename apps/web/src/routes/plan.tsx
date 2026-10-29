import { createFileRoute } from "@tanstack/react-router"
import { PlanPage } from "../features/plan"

export const Route = createFileRoute("/plan")({
  head: () => ({ meta: [{ title: "备考档案与计划 · 我的考研" }] }),
  component: PlanPage,
})
