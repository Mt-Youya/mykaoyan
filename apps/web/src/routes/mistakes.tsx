import { createFileRoute } from "@tanstack/react-router"
import { MistakesPage } from "../features/mistakes"

export const Route = createFileRoute("/mistakes")({
  head: () => ({ meta: [{ title: "错题与复测 · 我的考研" }] }),
  component: MistakesPage,
})
