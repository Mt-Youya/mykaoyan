import { createFileRoute } from "@tanstack/react-router"

import { PaperSubmitPage } from "../../features/exams"

export const Route = createFileRoute("/(community)/community/papers/new")({
  head: () => ({ meta: [{ title: "提交用户试卷 · 我的考研" }] }),
  component: PaperSubmitPage,
})
