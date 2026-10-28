import { afterEach, expect, it, vi } from "vitest"
import { listMajors, listRecords } from "./api"

afterEach(() => {
  vi.unstubAllGlobals()
})

function stub(response: Response) {
  const calls: string[] = []
  vi.stubGlobal("fetch", async (input: string) => {
    calls.push(input)
    return response.clone()
  })
  return calls
}

it("学科类别只在填写时随专业列表请求发送", async () => {
  const calls = stub(new Response("{}"))
  await listMajors(2027, "10001")
  await listMajors(2027, "10001", "0854")
  expect(calls).toEqual([
    "/api/admissions/units/10001/majors?year=2027",
    "/api/admissions/units/10001/majors?year=2027&discipline=0854",
  ])
})

it("错误时带回服务端说明，服务端没有说明时给出可手动填写的提示", async () => {
  stub(
    new Response(JSON.stringify({ title: "研招网目前只提供 2027 年度的招生目录，无法查询 2026 年度", status: 409 }), {
      status: 409,
    })
  )
  expect(await listRecords(2026, "10001", "085404")).toEqual({
    status: "error",
    message: "研招网目前只提供 2027 年度的招生目录，无法查询 2026 年度",
  })
  stub(new Response("bad gateway", { status: 502 }))
  expect(await listRecords(2027, "10001", "085404")).toEqual({
    status: "error",
    message: "招生目录暂时无法查询，可以先手动填写。",
  })
})
