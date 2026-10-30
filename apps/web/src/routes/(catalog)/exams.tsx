import { createFileRoute } from "@tanstack/react-router"

import { PapersListPage } from "../../features/exams"

export const Route = createFileRoute("/(catalog)/exams")({
  head: () => ({ meta: [{ title: "真题试卷 · 我的考研" }] }),
  component: PapersListPage,
})
