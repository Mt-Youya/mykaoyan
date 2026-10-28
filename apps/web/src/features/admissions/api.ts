/**
 * 招生目录查询：数据来自 apps/api 整理后的研招网目录，浏览器不直接访问研招网。
 *
 * 只在浏览器端调用（相对路径）；错误时带回服务端给出的说明文案。
 */

export type CodeName = { code: string; name: string | null }
export type AdmissionUnit = { code: string; name: string }
export type AdmissionMajor = {
  code: string
  name: string | null
  degree: "academic" | "professional" | null
  discipline: CodeName | null
}
export type SubjectGroup = { subjects: { code: string; name: string | null }[] }
export type AdmissionRecord = {
  id: string
  unit: CodeName
  college: CodeName
  major: CodeName
  direction: CodeName
  mode: "full_time" | "part_time" | null
  groups: SubjectGroup[]
  sourceUrl: string | null
}
/** 研招网匿名查询只返回前 10 行；`truncated` 为真时列表不完整。 */
export type Coverage = { total: number | null; returned: number; truncated: boolean }
type Checked = { checkedAt: string; stale: boolean }

export type UnitList = Checked & { units: AdmissionUnit[] }
export type MajorList = Checked & { year: number; majors: AdmissionMajor[]; coverage: Coverage }
export type RecordList = Checked & { year: number; records: AdmissionRecord[]; coverage: Coverage }

export type Lookup<T> = { status: "ok"; data: T } | { status: "error"; message: string }

const FALLBACK = "招生目录暂时无法查询，可以先手动填写。"

async function request<T>(path: string, signal?: AbortSignal): Promise<Lookup<T>> {
  try {
    const response = await fetch(path, { signal: signal ?? null, headers: { accept: "application/json" } })
    if (response.ok) return { status: "ok", data: (await response.json()) as T }
    const problem = (await response.json().catch(() => null)) as { title?: unknown } | null
    // 服务端的 problem 标题都是面向考生的文案，不含内部信息。
    return { status: "error", message: typeof problem?.title === "string" ? problem.title : FALLBACK }
  } catch {
    return { status: "error", message: FALLBACK }
  }
}

export const searchUnits = (keyword: string, signal?: AbortSignal) =>
  request<UnitList>(`/api/admissions/units?${new URLSearchParams({ keyword })}`, signal)

/** `discipline` 是一级学科或专业学位类别的四位代码，例如 0812、0854。 */
export const listMajors = (year: number, unit: string, discipline?: string, signal?: AbortSignal) =>
  request<MajorList>(
    `/api/admissions/units/${encodeURIComponent(unit)}/majors?${new URLSearchParams({
      year: String(year),
      ...(discipline ? { discipline } : {}),
    })}`,
    signal
  )

export const listRecords = (year: number, unit: string, major: string, signal?: AbortSignal) =>
  request<RecordList>(`/api/admissions/records?${new URLSearchParams({ year: String(year), unit, major })}`, signal)
