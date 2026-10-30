import { createFileRoute } from "@tanstack/react-router"

import { AdminPage } from "../../features/admin"

export const Route = createFileRoute("/(admin)/admin/content")({
  head: () => ({ meta: [{ title: "内容管理 · 我的考研" }] }),
  component: AdminPage,
})
