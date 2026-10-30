import { createFileRoute } from "@tanstack/react-router"

import { PapersPage } from "../features/papers"

export const Route = createFileRoute("/papers")({
  head: () => ({ meta: [{ title: "试卷 · 我的考研" }] }),
  component: PapersPage,
})
