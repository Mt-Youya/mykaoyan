import { z } from "zod"

export type ExamSubject = { code: string; name: string }
export const standardSubjects: ExamSubject[] = [
  { code: "101", name: "思想政治理论" },
  { code: "201", name: "英语一" },
  { code: "204", name: "英语二" },
  { code: "301", name: "数学一" },
  { code: "302", name: "数学二" },
  { code: "303", name: "数学三" },
  { code: "408", name: "计算机学科专业基础" },
]
const byCode = (codes: string[]) => codes.map((code) => ({ ...standardSubjects.find((s) => s.code === code)! }))
export const presets = {
  "11408": byCode(["101", "201", "301", "408"]),
  "22408": byCode(["101", "204", "302", "408"]),
}
const text = z.string().trim().max(120)
const targetSchema = z.object({ school: text, college: text, major: text, direction: text, mode: text })
const emptyTarget = { school: "", college: "", major: "", direction: "", mode: "" }
/** 考试科目从研招网招生条目带出时的来源；手动修改目标后清空。只接受研招网条目详情页。 */
const sourceSchema = z.object({
  url: z
    .string()
    .regex(/^https:\/\/yz\.chsi\.com\.cn\/zsml\/yjfxdetail\?id=[0-9a-f]{32}$/i)
    .nullable(),
  checkedAt: z.iso.datetime(),
})
export type CatalogSource = z.infer<typeof sourceSchema>
const draftSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    target: targetSchema.default(emptyTarget),
    subjects: z
      .array(z.object({ code: z.string().regex(/^\d{3}$/), name: text.min(1) }))
      .min(1)
      .max(8)
      .transform((items) => items.map((item) => standardSubjects.find((s) => s.code === item.code) ?? item)),
    active: z.array(z.string()).min(1).max(8),
    vocabulary: z.boolean().default(true),
    source: sourceSchema.nullable().default(null),
  })
  .refine(({ subjects, active, target }) => {
    const codes = new Set(subjects.map((s) => s.code))
    return (
      codes.size === subjects.length &&
      new Set(active).size === active.length &&
      active.every((code) => codes.has(code)) &&
      subjects.every((s) => {
        const standard = standardSubjects.find((item) => item.code === s.code)
        return standard ? standard.name === s.name : target.school.length > 0
      })
    )
  })

// shortcut: 目标与学习范围仅为本机界面草稿；接入档案云端保存时再扩展公开契约。
/** 界面选择草稿；不替代公开契约中的 StudyProfile，不伪造初试日期与目标分。 */
export type StudyDraft = z.infer<typeof draftSchema>
export function createDraft(year: number): StudyDraft {
  return { year, target: { ...emptyTarget }, subjects: [], active: [], vocabulary: true, source: null }
}
export const STORAGE_KEY = "mykaoyan.study-draft"
type Readable = Pick<Storage, "getItem">
type Writable = Pick<Storage, "setItem">
export function parseDraft(raw: string): StudyDraft | null {
  try {
    const result = draftSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
export function readDraft(storage: Readable): StudyDraft | null {
  const raw = storage.getItem(STORAGE_KEY)
  return raw === null ? null : parseDraft(raw)
}
export function writeDraft(storage: Writable, draft: StudyDraft): void {
  const valid = draftSchema.parse(draft)
  storage.setItem(STORAGE_KEY, JSON.stringify(valid))
}
