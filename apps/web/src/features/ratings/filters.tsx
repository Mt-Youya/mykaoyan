import { useState } from "react"

import { publicTopics } from "@mykaoyan/core"
import { Button, Field, FieldGroup, FieldLabel, Input } from "@mykaoyan/ui"
export function RatingFilters({
  subject,
  topic,
  onApply,
}: {
  subject: string
  topic: string
  onApply: (subject: string, topic: string) => void
}) {
  const [draftSubject, setSubject] = useState(subject),
    [draftTopic, setTopic] = useState(topic)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onApply(draftSubject, draftTopic)
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="rating-subject-filter">筛选考试科目（三位代码）</FieldLabel>
          <Input
            id="rating-subject-filter"
            className="min-h-11"
            value={draftSubject}
            required
            maxLength={3}
            pattern="[0-9]{3}"
            onChange={(e) => {
              setSubject(e.target.value)
              setTopic("")
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="rating-topic-filter">筛选考点</FieldLabel>
          <select
            id="rating-topic-filter"
            className="min-h-11 rounded-md border border-input bg-background px-3 focus-visible:outline-2 focus-visible:outline-ring"
            value={draftTopic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="">全部考点</option>
            {publicTopics
              .filter((t) => t.subject === draftSubject)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} {t.title}
                </option>
              ))}
          </select>
        </Field>
        <Button className="min-h-11 self-start" type="submit" variant="outline">
          筛选投稿
        </Button>
      </FieldGroup>
    </form>
  )
}
