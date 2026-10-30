import { expect, it } from "vitest"

import { favoriteFromInput, readFavorites, writeFavorites } from "./favorites"

const record = {
  id: "source-record",
  unit: { code: "10001", name: "虚构大学" },
  college: { code: "001", name: "虚构学院" },
  major: { code: "085404", name: "虚构专业" },
  direction: { code: "01", name: "虚构方向" },
  mode: "full_time" as const,
  groups: [{ subjects: [{ code: "302", name: "数学二" }] }],
  sourceUrl: "https://yz.chsi.com.cn/zsml/yjfxdetail?id=0123456789abcdef0123456789abcdef",
}

it("收藏保留查询来源与完整招生条目，并能从本机存储恢复", () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
  const favorite = favoriteFromInput(2027, record, "2026-10-28T00:00:00.000Z")
  writeFavorites(storage, [favorite])
  expect(readFavorites(storage)).toEqual([favorite])
})
