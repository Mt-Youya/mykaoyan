import { createFileRoute } from "@tanstack/react-router"

import { SupportDocument } from "./-legal/documents"

export const Route = createFileRoute("/support")({
  head: () => ({ meta: [{ title: "投诉举报与申诉 | 我的考研" }] }),
  component: SupportDocument,
})
