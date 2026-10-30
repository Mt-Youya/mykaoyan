import { useState } from "react"
import { Button, Field, FieldGroup, FieldLabel, ToggleGroup, ToggleGroupItem } from "@mykaoyan/ui"
import { MembershipAction, MembershipHelp } from "../membership"
import type { MembershipAccess } from "../membership"
import { RatingRequestError, ratingRequest } from "./api"
export function RatingControl({
  submissionId,
  access,
  onSaved,
}: {
  submissionId: string
  access: MembershipAccess
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false),
    [stars, setStars] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [denied, setDenied] = useState<"guest" | "nonmember" | null>(null)
  function fail(error: unknown) {
    if (error instanceof RatingRequestError && (error.status === 401 || error.status === 403)) {
      setDenied(error.status === 401 ? "guest" : "nonmember")
      setOpen(false)
    }
    setMessage(error instanceof Error ? error.message : "评分操作失败")
  }
  async function load() {
    setBusy(true)
    setMessage("")
    setDenied(null)
    setOpen(false)
    try {
      const result = await ratingRequest(submissionId)
      if (result.isOwn) {
        setMessage("不能给自己的投稿评分。")
        return
      }
      setStars(result.stars)
      setOpen(true)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (stars === null) return
    setBusy(true)
    setMessage("")
    try {
      await ratingRequest(submissionId, "PUT", { stars })
      setOpen(false)
      onSaved()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }
  const labelId = `rating-label-${submissionId}`
  return (
    <div className="flex flex-col items-start gap-3">
      <MembershipAction label="评分" access={denied ?? access} disabled={busy} onAllowed={() => void load()} />
      {denied ? <MembershipHelp guest={denied === "guest"} /> : null}
      {open ? (
        <form onSubmit={save}>
          <FieldGroup>
            <Field>
              <FieldLabel id={labelId}>我的评分</FieldLabel>
              <ToggleGroup
                aria-labelledby={labelId}
                variant="outline"
                value={stars === null ? [] : [String(stars)]}
                onValueChange={(value) => setStars(value[0] ? Number(value[0]) : null)}
                disabled={busy}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <ToggleGroupItem
                    key={value}
                    value={String(value)}
                    className="min-h-11 min-w-11"
                    aria-label={`${value}星`}
                  >
                    {value}星
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <div className="flex gap-3">
              <Button className="min-h-11" type="submit" disabled={busy || stars === null}>
                保存评分
              </Button>
              <Button
                className="min-h-11"
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                取消
              </Button>
            </div>
          </FieldGroup>
        </form>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  )
}
