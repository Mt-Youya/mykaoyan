import { CHSI_ORIGIN, UpstreamError } from "./client"

/**
 * 把研招网的上游字段整理成本站的招生目录记录。
 *
 * 字段含义以实测样本为准；上游缺失的值一律为 null，不用默认值填充。
 */

/** 上游 `/zsml/rs/*` 匿名请求只返回第一页，固定 10 行；后续页返回「请登录」。 */
export const ANONYMOUS_ROW_LIMIT = 10

export type CodeName = { code: string; name: string | null }
export type StudyMode = "full_time" | "part_time"

/** 招生单位；`code` 是官方五位招生单位代码，不是研招网内部 ID。 */
export type AdmissionUnit = { code: string; name: string }

export type AdmissionMajor = {
  code: string
  name: string | null
  degree: "academic" | "professional" | null
  /** 一级学科或专业学位类别，例如 0812、0854；不决定考试科目。 */
  discipline: CodeName | null
}

export type ExamSubject = { code: string; name: string | null }

/** 一组完整初试科目；同一条目有多组时，组与组之间是「或」，由考生选定。 */
export type SubjectGroup = { subjects: ExamSubject[] }

/** 一条招生条目：学校、学院、专业、方向、学习方式共同确定一组考试要求。 */
export type AdmissionRecord = {
  id: string
  unit: CodeName
  college: CodeName
  major: CodeName
  direction: CodeName
  mode: StudyMode | null
  groups: SubjectGroup[]
  /** 研招网的公开条目详情页，供考生核对。 */
  sourceUrl: string | null
}

/** 截断状态：上游报告的总数与实际返回数，不能把「只拿到前 10 行」当成全部。 */
export type Coverage = { total: number | null; returned: number; truncated: boolean }

type Row = Record<string, unknown>

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

const codeName = (code: unknown, name: unknown): CodeName => ({ code: text(code) ?? "", name: text(name) })

const isRow = (value: unknown): value is Row => value !== null && typeof value === "object" && !Array.isArray(value)

/** 取出 `{ flag, msg: { totalCount, list } }` 形状的列表；结构不符视为上游异常。 */
export function readPage(payload: unknown): { rows: Row[]; coverage: Coverage } {
  const msg = isRow(payload) ? payload.msg : undefined
  if (!isRow(msg) || !Array.isArray(msg.list)) throw new UpstreamError("bad_payload", "研招网返回的数据结构无法识别")
  const rows = msg.list.filter(isRow)
  const total = typeof msg.totalCount === "number" ? msg.totalCount : null
  return { rows, coverage: { total, returned: rows.length, truncated: total !== null && total > rows.length } }
}

export function normalizeUnit(row: Row): AdmissionUnit | null {
  const code = text(row.dwdm)
  const name = text(row.dwmc)
  return code && /^\d{5}$/.test(code) && name ? { code, name } : null
}

export function normalizeMajor(row: Row): AdmissionMajor {
  const degree = text(row.xwlx)
  const discipline = text(row.yjxkdm)
  return {
    code: text(row.zydm) ?? "",
    name: text(row.zymc),
    degree: degree === "xs" ? "academic" : degree === "zyxw" ? "professional" : null,
    discipline: discipline ? { code: discipline, name: text(row.yjxkmc) } : null,
  }
}

/** 上游用 `('-','无')`、`('--','无')` 占位表示该位置没有科目，例如管理类联考只有两门。 */
function normalizeSubject(value: unknown): ExamSubject | null {
  if (!isRow(value)) return null
  const code = text(value.kskmdm)
  const name = text(value.kskmmc)
  if (!code || /^[-—]+$/.test(code) || name === "无") return null
  return { code, name }
}

/** `kskmz` 每组固定 4 个位置（政治、外语、业务课一、业务课二），组与组之间是「或」。 */
export function normalizeGroups(value: unknown): SubjectGroup[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRow).flatMap((group) => {
    const subjects = [1, 2, 3, 4]
      .map((position) => normalizeSubject(group[`km${position}Vo`]))
      .filter((subject) => subject !== null)
    return subjects.length ? [{ subjects }] : []
  })
}

export function normalizeRecord(row: Row): AdmissionRecord {
  const id = text(row.id)
  const mode = text(row.xxfs)
  return {
    id: id ?? "",
    unit: codeName(row.dwdm, row.dwmc),
    college: codeName(row.yxsdm, row.yxsmc),
    major: codeName(row.zydm, row.zymc),
    direction: codeName(row.yjfxdm, row.yjfxmc),
    mode: mode === "1" ? "full_time" : mode === "2" ? "part_time" : null,
    groups: normalizeGroups(row.kskmz),
    sourceUrl: id && /^[0-9a-f]{32}$/i.test(id) ? `${CHSI_ORIGIN}/zsml/yjfxdetail?id=${id}` : null,
  }
}

/** 目录年度只取页面自述的 `curYear`；取不到就返回 null，不按日期猜。 */
export function parseCatalogYear(html: string): number | null {
  const match = /curYear\s*:\s*["'](\d{4})["']/.exec(html)
  const year = match?.[1] ? Number(match[1]) : null
  return year !== null && year >= 2000 && year <= 2100 ? year : null
}
