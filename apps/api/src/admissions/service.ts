import { ConflictException, Inject, Injectable } from "@nestjs/common"
import { UpstreamError } from "./client"
import type { ChsiClient } from "./client"
import {
  ANONYMOUS_ROW_LIMIT,
  normalizeMajor,
  normalizeRecord,
  normalizeUnit,
  parseCatalogYear,
  readPage,
} from "./normalize"
import type { AdmissionMajor, AdmissionRecord, AdmissionUnit, Coverage, StudyMode } from "./normalize"

/** 研招网客户端的注入标记；测试中替换为使用桩 fetch、不限速的实例。 */
export const CHSI_CLIENT = Symbol("chsi-client")

const TTL_MS = 6 * 60 * 60 * 1000
const MAX_ENTRIES = 1000

type Cached<T> = { value: T; checkedAt: string; expiresAt: number }

/** 每个结果都带核验时间；`stale` 表示上游失败时沿用的旧结果。 */
export type Checked<T> = T & { checkedAt: string; stale: boolean }

export type CatalogYear = { year: number }
export type UnitList = { units: AdmissionUnit[] }
export type MajorList = { year: number; majors: AdmissionMajor[]; coverage: Coverage }
export type RecordList = { year: number; records: AdmissionRecord[]; coverage: Coverage }

/**
 * 研招网硕士专业目录的只读查询。
 *
 * 上游只提供当前一个招生年度，没有年度参数：请求其他年度直接拒绝，不拿当前目录冒充。
 * 结果在进程内缓存，同一个键并发只请求一次上游。
 */
@Injectable()
export class AdmissionsService {
  private readonly cache = new Map<string, Cached<unknown>>()
  private readonly inflight = new Map<string, Promise<Checked<unknown>>>()

  constructor(@Inject(CHSI_CLIENT) private readonly client: ChsiClient) {}

  async catalogYear(): Promise<Checked<CatalogYear>> {
    return this.cached("year", async () => {
      const year = parseCatalogYear(await this.client.text({ path: "/zsml/", method: "GET" }))
      if (year === null) throw new UpstreamError("bad_payload", "无法从研招网确认当前招生年度")
      return { year }
    })
  }

  /** 按名称查找招生单位（研招网名称补全，返回官方单位代码）。 */
  async searchUnits(keyword: string): Promise<Checked<UnitList>> {
    return this.cached(`units:${keyword}`, async () => {
      const payload = await this.client.json({ path: "/zsml/code/autodw.do", method: "GET", params: { q: keyword } })
      if (!Array.isArray(payload)) throw new UpstreamError("bad_payload", "研招网返回的数据结构无法识别")
      const units = payload
        .map((row) => (row && typeof row === "object" ? normalizeUnit(row as Record<string, unknown>) : null))
        .filter((unit) => unit !== null)
      return { units }
    })
  }

  /** 招生单位的招生专业；匿名只能拿到前 10 个，截断写在 `coverage` 里。 */
  /**
   * 可按一级学科或专业学位类别（四位代码，例如 0812、0854）筛选，让目标专业落进前 10 个。
   */
  async listMajors(year: number, unitCode: string, discipline?: string): Promise<Checked<MajorList>> {
    const served = await this.requireYear(year)
    const params: Record<string, string> = {
      dwdm: unitCode,
      start: "0",
      curPage: "1",
      pageSize: String(ANONYMOUS_ROW_LIMIT),
    }
    if (discipline) params.yjxkdm = discipline
    return this.cached(`majors:${served}:${unitCode}:${discipline ?? "any"}`, async () => {
      const payload = await this.client.json({ path: "/zsml/rs/dwzys.do", method: "POST", params })
      const { rows, coverage } = readPage(payload)
      return { year: served, majors: rows.map(normalizeMajor), coverage }
    })
  }

  /** 某单位某专业的招生条目（学院、方向、学习方式与科目组）。只传代码：上游把名称当筛选条件。 */
  async listRecords(year: number, unitCode: string, majorCode: string, mode?: StudyMode): Promise<Checked<RecordList>> {
    const served = await this.requireYear(year)
    const params: Record<string, string> = {
      dwdm: unitCode,
      zydm: majorCode,
      start: "0",
      pageSize: String(ANONYMOUS_ROW_LIMIT),
    }
    if (mode) params.xxfs = mode === "full_time" ? "1" : "2"
    return this.cached(`records:${served}:${unitCode}:${majorCode}:${mode ?? "any"}`, async () => {
      const { rows, coverage } = readPage(await this.client.json({ path: "/zsml/rs/yjfxs.do", method: "POST", params }))
      return { year: served, records: rows.map(normalizeRecord), coverage }
    })
  }

  private async requireYear(requested: number): Promise<number> {
    const { year } = await this.catalogYear()
    if (requested !== year) {
      throw new ConflictException(`研招网目前只提供 ${year} 年度的招生目录，无法查询 ${requested} 年度`)
    }
    return year
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<Checked<T>> {
    const entry = this.cache.get(key) as Cached<T> | undefined
    if (entry && entry.expiresAt > Date.now()) return { ...entry.value, checkedAt: entry.checkedAt, stale: false }
    const running = this.inflight.get(key)
    if (running) return running as Promise<Checked<T>>
    const task = (async (): Promise<Checked<T>> => {
      try {
        const value = await load()
        const checkedAt = new Date().toISOString()
        this.store(key, { value, checkedAt, expiresAt: Date.now() + TTL_MS })
        return { ...value, checkedAt, stale: false }
      } catch (error) {
        // 上游失败时沿用旧结果并标明 stale；没有旧结果才报错。
        if (entry) return { ...entry.value, checkedAt: entry.checkedAt, stale: true }
        throw error
      } finally {
        this.inflight.delete(key)
      }
    })()
    this.inflight.set(key, task)
    return task
  }

  private store(key: string, entry: Cached<unknown>) {
    this.cache.delete(key)
    if (this.cache.size >= MAX_ENTRIES) {
      const oldest = this.cache.keys().next()
      if (!oldest.done) this.cache.delete(oldest.value)
    }
    this.cache.set(key, entry)
  }
}
