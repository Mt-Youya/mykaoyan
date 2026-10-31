import { createFileRoute } from "@tanstack/react-router"

import { communityPaperAnswersHead, PaperAnswersPage } from "../../features/exams"

export const Route = createFileRoute("/(community)/community/papers/$slug/answers")({
  head: () => communityPaperAnswersHead,
  component: AnswersRoute,
})

function AnswersRoute() {
  const { slug } = Route.useParams()
  return <PaperAnswersPage slug={slug} community />
}
