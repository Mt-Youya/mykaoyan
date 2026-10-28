import type { ProgressFixture } from "./types"
import { fullProgressFileFixture } from "./valid"

type JsonObject = Record<string, unknown>

function clone(source: unknown): JsonObject {
  return JSON.parse(JSON.stringify(source)) as JsonObject
}

function dataOf(file: JsonObject): JsonObject {
  return file.data as JsonObject
}

function listAt(parent: JsonObject, key: string): JsonObject[] {
  const list = parent[key]
  if (!Array.isArray(list)) throw new Error(`fixture 缺少数组 ${key}`)
  return list as JsonObject[]
}

function recordAt(file: JsonObject, key: string, index = 0): JsonObject {
  const record = listAt(dataOf(file), key)[index]
  if (!record) throw new Error(`fixture 缺少 ${key}[${index}]`)
  return record
}

/** 在完整有效 fixture 上故意改坏一处；fixture 漂移时直接报错，不静默通过。 */
function invalid(name: string, mutate: (file: JsonObject) => void): ProgressFixture {
  const file = clone(fullProgressFileFixture.value)
  mutate(file)
  return { name, value: file }
}

/** 无效 fixture 组：每个 fixture 只违反一条契约。全部为虚构数据。 */
export const invalidProgressFixtures: readonly ProgressFixture[] = [
  invalid("wrong-app", (file) => {
    file.app = "kaoyan"
  }),
  invalid("unsupported-version", (file) => {
    file.version = 2
  }),
  invalid("unknown-top-level-field", (file) => {
    file.device = "虚构设备"
  }),
  invalid("unknown-data-collection", (file) => {
    dataOf(file).vocabulary = []
  }),
  invalid("unknown-record-field", (file) => {
    recordAt(file, "daily").source = "虚构来源"
  }),
  invalid("invalid-local-date", (file) => {
    recordAt(file, "daily").date = "2025-02-29"
  }),
  invalid("local-date-with-time", (file) => {
    recordAt(file, "daily").date = "2030-03-10T00:00:00Z"
  }),
  invalid("missing-timezone", (file) => {
    file.updatedAt = "2030-03-10T21:30:00"
  }),
  invalid("fractional-revision", (file) => {
    file.revision = 0.5
  }),
  invalid("negative-revision", (file) => {
    file.revision = -1
  }),
  invalid("negative-minutes", (file) => {
    const minutes = recordAt(file, "daily").minutes as JsonObject
    minutes["302"] = -1
  }),
  invalid("invalid-subject-code", (file) => {
    const minutes = recordAt(file, "daily").minutes as JsonObject
    minutes["30"] = 10
  }),
  invalid("invalid-retest-result", (file) => {
    const first = listAt(recordAt(file, "mistakes"), "retests")[0]
    if (!first) throw new Error("fixture 缺少 retests[0]")
    first.result = "done"
  }),
  invalid("derived-manual-state", (file) => {
    recordAt(file, "progress").manual = "stable"
  }),
  invalid("blank-topic-id", (file) => {
    recordAt(file, "progress").topicId = "   "
  }),
  invalid("profile-not-object", (file) => {
    dataOf(file).profile = "虚构档案"
  }),
  invalid("missing-collection", (file) => {
    delete dataOf(file).weekly
  }),
  invalid("missing-data", (file) => {
    delete file.data
  }),
]
