/**
 * 按业务键唯一：已有同键条目时替换第一条并移除后续重复项，否则追加；不改入参。
 * 进度文件来自上传，可能出现重复键；写入时按契约归并。
 */
export function upsertUniqueBy<T>(items: readonly T[], key: (item: T) => string, value: T): T[] {
  const valueKey = key(value)
  const first = items.findIndex((item) => key(item) === valueKey)
  if (first === -1) return [...items, value]
  return items.flatMap((item, index) => {
    if (index === first) return [value]
    return key(item) === valueKey ? [] : [item]
  })
}
