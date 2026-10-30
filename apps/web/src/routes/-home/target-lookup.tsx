import { useState } from "react"

import { Button, Input, Label } from "@mykaoyan/ui"

import { listMajors, listRecords, searchUnits } from "../../features/admissions"
import type {
  AdmissionRecord,
  AdmissionUnit,
  Coverage,
  Lookup,
  MajorList,
  RecordList,
  SubjectGroup,
  UnitList,
} from "../../features/admissions"
import { standardSubjects } from "../../features/profile"
import type { CatalogSource, ExamSubject, StudyDraft } from "../../features/profile"

export type CatalogSelection = { target: StudyDraft["target"]; subjects: ExamSubject[]; source: CatalogSource }
export type AdmissionFavoriteInput = { record: AdmissionRecord; checkedAt: string }

const modeLabel = { full_time: "全日制", part_time: "非全日制" } as const
const label = (item: { code: string; name: string | null }) => [item.code, item.name].filter(Boolean).join(" ")
const timeFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  dateStyle: "medium",
  timeStyle: "short",
})

const caption = "mt-6 max-w-[65ch] text-sm text-muted-foreground"
const fieldsGrid = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] gap-6"
const fieldLabel = "flex-col items-stretch gap-2 text-base leading-relaxed font-normal"
const fieldInput = "min-h-12 bg-note-paper px-3 py-2 text-base md:text-base"
const buttonSize = "min-h-12 px-6 text-base"
// 学校与专业名称可能很长：允许换行，不超出容器宽度。
const pressedButton = `${buttonSize} h-auto max-w-full justify-start py-2 text-left whitespace-normal aria-pressed:border-primary aria-pressed:bg-book-blue aria-pressed:hover:bg-book-blue`
const actions = "flex flex-wrap gap-3"
const textLink =
  "underline underline-offset-4 hover:decoration-2 active:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
const summaryCard =
  "mt-4 border-y border-border bg-paper-soft p-6 wrap-anywhere first:mt-0 [&>p]:max-w-[65ch] [&>p+p]:mt-3"

/** 统考科目沿用站内名称；其他科目用招生目录的正式名称，缺名称时不能带入。 */
export function toSubjects(group: SubjectGroup): ExamSubject[] | null {
  const subjects = group.subjects.map(({ code, name }) => {
    const standard = standardSubjects.find((s) => s.code === code)
    return standard ? { ...standard } : name ? { code, name } : null
  })
  return subjects.every((s) => s !== null) && subjects.length <= 8 ? subjects : null
}

function Truncated({ coverage, noun }: { coverage: Coverage; noun: string }) {
  if (!coverage.truncated) return null
  return (
    <p className={caption} role="note">
      研招网未登录时只返回前 {coverage.returned} 个{noun}
      {coverage.total === null ? "" : `（共 ${coverage.total} 个）`}，列表不完整。
    </p>
  )
}

function Checked({ data }: { data: { checkedAt: string; stale: boolean } }) {
  const time = timeFormat.format(new Date(data.checkedAt))
  return (
    <p className={caption}>{data.stale ? `研招网暂时无法访问，以下为 ${time} 的查询结果。` : `查询于 ${time}。`}</p>
  )
}

/**
 * 从研招网当前年度目录查找报考目标：学校 → 专业 → 招生条目 → 科目组。
 *
 * 上游没有学院列表，学院、方向与学习方式随招生条目出现；带出的科目仍由考生确认，手动填写一直可用。
 */
export function TargetLookup({
  year,
  onApply,
  onFavorite,
}: {
  year: number
  onApply: (selection: CatalogSelection) => void
  onFavorite?: (input: AdmissionFavoriteInput) => void
}) {
  const [keyword, setKeyword] = useState("")
  const [units, setUnits] = useState<Lookup<UnitList> | null>(null)
  const [unit, setUnit] = useState<AdmissionUnit | null>(null)
  const [majors, setMajors] = useState<Lookup<MajorList> | null>(null)
  const [discipline, setDiscipline] = useState("")
  const [filtered, setFiltered] = useState("")
  const [majorCode, setMajorCode] = useState("")
  const [records, setRecords] = useState<Lookup<RecordList> | null>(null)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState("")

  async function run<T>(task: () => Promise<T>) {
    setBusy(true)
    try {
      return await task()
    } finally {
      setBusy(false)
    }
  }
  async function findUnits() {
    const text = keyword.trim()
    if (text.length < 2) return setHint("请输入至少两个字的学校名称。")
    setHint("")
    setUnit(null)
    setMajors(null)
    setRecords(null)
    setUnits(await run(() => searchUnits(text)))
  }
  async function chooseUnit(next: AdmissionUnit) {
    setUnit(next)
    setRecords(null)
    setDiscipline("")
    setFiltered("")
    setMajors(await run(() => listMajors(year, next.code)))
  }
  /** 研招网匿名只返回前 10 个专业；按学科类别筛选后目标专业通常就在其中。 */
  async function filterMajors(code: string) {
    if (!unit) return
    const normalized = code.trim()
    if (normalized && !/^\d{4}$/.test(normalized)) return setHint("学科类别代码是四位数字，例如 0812、0854。")
    setHint("")
    setDiscipline(normalized)
    setFiltered(normalized)
    setRecords(null)
    setMajors(await run(() => listMajors(year, unit.code, normalized || undefined)))
  }
  async function findRecords(code: string) {
    if (!unit) return
    const normalized = code.trim().toUpperCase()
    if (!/^\d{4}[0-9A-Z]{2}$/.test(normalized)) return setHint("招生专业代码是六位，例如 085404。")
    setHint("")
    setMajorCode(normalized)
    setRecords(await run(() => listRecords(year, unit.code, normalized)))
  }
  function apply(record: AdmissionRecord, group: SubjectGroup, checkedAt: string) {
    const subjects = toSubjects(group)
    if (!subjects) return
    onApply({
      target: {
        school: record.unit.name ?? unit?.name ?? "",
        college: label(record.college),
        major: label(record.major),
        direction: label(record.direction),
        mode: record.mode ? modeLabel[record.mode] : "",
      },
      subjects,
      source: { url: record.sourceUrl, checkedAt },
    })
    setHint(`已带入「${label(record.college)} · ${label(record.direction)}」的科目，请到下一步核对。`)
  }

  return (
    <fieldset className="min-w-0 [&>*+*]:mt-6" aria-busy={busy}>
      <legend className="mb-4 font-semibold">从研招网 {year} 招生目录查找（可选）</legend>
      <div className={fieldsGrid}>
        <Label className={fieldLabel}>
          学校名称
          <Input
            maxLength={30}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void findUnits()
              }
            }}
            className={fieldInput}
          />
        </Label>
      </div>
      <Button type="button" variant="outline" className={buttonSize} disabled={busy} onClick={() => void findUnits()}>
        查找学校
      </Button>
      {units?.status === "error" && (
        <p role="alert" className="border border-border p-4 text-foreground">
          {units.message}
        </p>
      )}
      {units?.status === "ok" && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="查找到的学校">
          {units.data.units.length === 0 && <p className={caption}>没有找到名称包含「{keyword.trim()}」的招生单位。</p>}
          {units.data.units.map((item) => (
            <Button
              key={item.code}
              type="button"
              variant="outline"
              className={pressedButton}
              aria-pressed={unit?.code === item.code}
              disabled={busy}
              onClick={() => void chooseUnit(item)}
            >
              {item.code} {item.name}
            </Button>
          ))}
        </div>
      )}
      {unit && majors?.status === "error" && (
        <p role="alert" className="border border-border p-4 text-foreground">
          {majors.message}
        </p>
      )}
      {unit && majors && (
        <>
          <div className={fieldsGrid}>
            <Label className={fieldLabel}>
              按学科类别缩小（四位代码，如 0812 计算机科学与技术、0854 电子信息）
              <Input
                inputMode="numeric"
                maxLength={4}
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void filterMajors(discipline)
                  }
                }}
                className={fieldInput}
              />
            </Label>
          </div>
          <div className={actions}>
            <Button
              type="button"
              variant="outline"
              className={buttonSize}
              disabled={busy}
              onClick={() => void filterMajors(discipline)}
            >
              筛选专业
            </Button>
            {filtered && (
              <Button
                type="button"
                variant="outline"
                className={buttonSize}
                disabled={busy}
                onClick={() => void filterMajors("")}
              >
                清除筛选
              </Button>
            )}
          </div>
        </>
      )}
      {unit && majors?.status === "ok" && (
        <>
          {majors.data.majors.length === 0 && (
            <p className={caption}>
              {filtered
                ? `${unit.name}在 ${year} 年度目录中没有学科类别 ${filtered} 下的招生专业。`
                : `${unit.name}在 ${year} 年度目录中没有招生专业。`}
            </p>
          )}
          <div className="flex flex-wrap gap-2" role="group" aria-label={`${unit.name}的招生专业`}>
            {majors.data.majors.map((major) => (
              <Button
                key={major.code}
                type="button"
                variant="outline"
                className={pressedButton}
                aria-pressed={majorCode === major.code}
                disabled={busy}
                onClick={() => void findRecords(major.code)}
              >
                {label(major)}
              </Button>
            ))}
          </div>
          <Truncated coverage={majors.data.coverage} noun="专业" />
          <div className={fieldsGrid}>
            <Label className={fieldLabel}>
              没有看到目标专业？输入六位专业代码
              <Input
                maxLength={6}
                value={majorCode}
                onChange={(e) => setMajorCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void findRecords(majorCode)
                  }
                }}
                className={fieldInput}
              />
            </Label>
          </div>
          <Button
            type="button"
            variant="outline"
            className={buttonSize}
            disabled={busy}
            onClick={() => void findRecords(majorCode)}
          >
            查询招生条目
          </Button>
        </>
      )}
      {records?.status === "error" && (
        <p role="alert" className="border border-border p-4 text-foreground">
          {records.message}
        </p>
      )}
      {records?.status === "ok" && (
        <div className="wrap-anywhere" aria-label="招生条目">
          {records.data.records.length === 0 && (
            <p className={caption}>
              该单位 {year} 年度目录中没有专业代码 {majorCode} 的招生条目。
            </p>
          )}
          {records.data.records.map((record) => (
            <article key={record.id} className={summaryCard}>
              <h3 className="mb-3 text-[1.05rem]">
                {label(record.college)} · {label(record.direction)} ·{" "}
                {record.mode ? modeLabel[record.mode] : "学习方式待核实"}
              </h3>
              {record.groups.length === 0 && <p>研招网未列出考试科目，请以招生简章为准并手动选择。</p>}
              {record.groups.length > 1 && <p>以下科目组任选其一（研招网标注为「或」）：</p>}
              {record.groups.map((group, index) => (
                <p key={index}>
                  {group.subjects.map(label).join(" + ")}{" "}
                  <Button
                    type="button"
                    variant="outline"
                    className={buttonSize}
                    disabled={!toSubjects(group)}
                    onClick={() => apply(record, group, records.data.checkedAt)}
                  >
                    {toSubjects(group) ? "采用这组科目" : "科目名称缺失，请手动填写"}
                  </Button>
                </p>
              ))}
              {onFavorite && (
                <Button
                  type="button"
                  variant="outline"
                  className={buttonSize}
                  onClick={() => onFavorite({ record, checkedAt: records.data.checkedAt })}
                >
                  收藏此条目
                </Button>
              )}
              {record.sourceUrl && (
                <a
                  href={record.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={`${textLink} inline-flex min-h-11 items-center`}
                >
                  在研招网核对此条目
                </a>
              )}
            </article>
          ))}
          <Truncated coverage={records.data.coverage} noun="招生条目" />
          <Checked data={records.data} />
        </div>
      )}
      {(busy || hint) && (
        <p role="status" className="text-muted-foreground">
          {busy ? "正在查询研招网…" : hint}
        </p>
      )}
      <p className={caption}>
        数据整理自研招网硕士专业目录（网页内部接口，非官方开放 API），可能随招生单位更新而变化，请以招生简章为准。
      </p>
    </fieldset>
  )
}
