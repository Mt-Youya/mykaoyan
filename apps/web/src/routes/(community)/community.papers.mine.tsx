import { createFileRoute } from "@tanstack/react-router"

import { MinePapersPage } from "../../features/exams"

export const Route = createFileRoute("/(community)/community/papers/mine")({
  head: () => ({ meta: [{ title: "我的试卷 · 我的考研" }] }),
  component: MinePapersPage,
})
