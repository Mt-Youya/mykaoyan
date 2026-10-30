import { createFileRoute } from "@tanstack/react-router"

import { TermsDocument } from "./-legal/documents"

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "用户协议 | 我的考研" }] }),
  component: TermsDocument,
})
