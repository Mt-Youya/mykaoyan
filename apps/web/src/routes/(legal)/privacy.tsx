import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequest, setResponseHeader } from "@tanstack/react-start/server"

import { apiOrigin } from "../(account)/-auth"
import { PrivacyDocument } from "./-legal/documents"

const fetchRegion = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("cache-control", "no-store")
  try {
    const response = await fetch(`${apiOrigin(getRequest())}/api/phone/policy`, { signal: AbortSignal.timeout(5000) })
    const policy = (await response.json()) as { databaseRegion?: string }
    if (response.ok && policy.databaseRegion) return policy.databaseRegion
  } catch {
    /* 登录接口不可用时全文仍可读，不猜测地区。 */
  }
  return "尚未确认"
})
export const Route = createFileRoute("/(legal)/privacy")({
  loader: () => fetchRegion(),
  head: () => ({ meta: [{ title: "隐私政策 | 我的考研" }] }),
  component: PrivacyPage,
})
function PrivacyPage() {
  return <PrivacyDocument databaseRegion={Route.useLoaderData()} />
}
