import { createFileRoute } from "@tanstack/react-router"

import { VocabPage } from "../features/vocab"

export const Route = createFileRoute("/vocabulary")({
  head: () => ({ meta: [{ title: "背单词 · 我的考研" }] }),
  component: VocabPage,
})
