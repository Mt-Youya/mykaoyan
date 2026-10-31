import { createFileRoute } from "@tanstack/react-router"

import { CommunityPapersListPage } from "../../features/exams"

export const Route = createFileRoute("/(community)/community/papers")({
  head: () => ({ meta: [{ title: "用户投稿试卷 · 我的考研" }] }),
  component: CommunityPapersListPage,
})
