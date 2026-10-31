import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  fullProgressFileFixture,
  invalidProgressFixtures,
  validProgressFixtures,
} from "../../packages/core/src/progress/fixtures/index.ts"

const requireFromCore = createRequire(new URL("../../packages/core/package.json", import.meta.url))
const Ajv2020 = requireFromCore("ajv/dist/2020")
const addFormats = requireFromCore("ajv-formats")
const publicSchema = JSON.parse(
  readFileSync(new URL("../../apps/web/public/schemas/progress/v1/progress.schema.json", import.meta.url)),
)
const ajv = new Ajv2020({ allErrors: true })
addFormats(ajv)
const validate = ajv.compile(publicSchema)
const skill = new URL("../../skills/mykaoyan/", import.meta.url)
const script = new URL("validate.mjs", skill)

function checkFile(text) {
  const directory = mkdtempSync(join(tmpdir(), "mykaoyan-skill-"))
  try {
    const file = join(directory, "progress.json")
    writeFileSync(file, text)
    return spawnSync(process.execPath, [fileURLToPath(script), file], { encoding: "utf8", cwd: directory })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe("mykaoyan skill 的独立校验入口", () => {
  it("项目双入口指向同一份 skill，入口只路由按需资料", () => {
    for (const path of ["../../.agents/skills/mykaoyan/", "../../.claude/skills/mykaoyan/"]) {
      expect(realpathSync(new URL(path, import.meta.url))).toBe(realpathSync(skill))
    }
    const entry = readFileSync(new URL("SKILL.md", skill), "utf8")
    expect(entry).toMatch(/name: mykaoyan/)
    expect(entry).toMatch(/^compatibility:/m)
    expect(entry).toContain("不用于词表、题库、浏览器备份、发布课程或修改网站代码")
    expect(entry).toContain("不要一次读取全部")
    expect(entry).toContain("只检查已有文件是否合法")
    expect(entry).toContain("没有基线先询问，不擅自联网")
    expect(entry).toContain("mykaoyan --json progress pull")
    expect(entry).toContain("mykaoyan --json progress validate")
    expect(entry).toContain("publish-handout")
    expect(entry).toContain("OpenAPI 3.2.0")
    expect(entry).toContain("JSON Schema")
    expect(entry).not.toContain("curl --")
    expect(entry).not.toContain("--request PUT")
    for (const [, target] of entry.matchAll(/\]\(([^)]+)\)/g)) {
      expect(target).toMatch(/^(references|templates)\/[^/]+$/)
      expect(existsSync(new URL(target, skill)), target).toBe(true)
    }
    const sync = readFileSync(new URL("references/sync.md", skill), "utf8")
    expect(sync).toContain("mykaoyan --version")
    expect(sync).toContain("mykaoyan --json progress push")
    expect(sync).toContain("OpenAPI 3.2.0")
    expect(sync).toContain("draft 2020-12")
    expect(sync).toContain("PowerShell")
    expect(sync).toContain("不能只换 ETag 重发旧文件")
  })

  for (const fixture of [...validProgressFixtures, ...invalidProgressFixtures]) {
    it(`${fixture.name} 与公开 schema 一致`, () => {
      const result = checkFile(JSON.stringify(fixture.value))
      expect(result.status, result.stderr).toBe(validate(fixture.value) ? 0 : 1)
      if (!validate(fixture.value)) expect(result.stderr).toContain("进度文件校验失败")
    })
  }

  const boundaries = [
    [["updatedAt"], "2024-02-29T12:34:56.123+08:00"],
    [["updatedAt"], "2025-02-29T12:34:56Z"],
    [["updatedAt"], "2030-01-01T24:00:00Z"],
    [["revision"], 9007199254740992],
    [["updatedBy"], "agent:"],
    [["updatedBy"], "agent:example"],
    [["data", "daily", 0, "date"], "2024-02-29"],
    [["data", "daily", 0, "date"], "2030-04-31"],
    [["data", "daily", 0, "minutes"], { 302: 1.5 }],
    [["data", "daily", 0, "minutes"], { 302: 0 }],
    [["data", "daily", 0, "minutes"], { secret: 5 }],
    [["data", "mistakes", 0, "causes"], ["unknown"]],
    [["data", "profile", "subjects", 0, "name"], "   "],
    [["data", "progress"], null],
  ]
  for (const [path, value] of boundaries) {
    it(`边界 ${path.join(".")}=${JSON.stringify(value)} 与公开 schema 一致`, () => {
      const candidate = structuredClone(fullProgressFileFixture.value)
      const parent = path.slice(0, -1).reduce((current, key) => current[key], candidate)
      parent[path.at(-1)] = value
      const result = checkFile(JSON.stringify(candidate))
      expect(result.status, result.stderr).toBe(validate(candidate) ? 0 : 1)
    })
  }

  it("独立复制后无需仓库依赖，未知契约约束不能静默略过", () => {
    const directory = mkdtempSync(join(tmpdir(), "mykaoyan-skill-copy-"))
    try {
      cpSync(skill, join(directory, "mykaoyan"), { recursive: true })
      const copiedScript = join(directory, "mykaoyan/validate.mjs")
      const template = join(directory, "mykaoyan/templates/progress.v1.json")
      expect(spawnSync(process.execPath, [copiedScript, template], { cwd: directory }).status).toBe(0)
      writeFileSync(
        join(directory, "mykaoyan/references/progress.schema.json"),
        JSON.stringify({ ...publicSchema, not: {} }),
      )
      const result = spawnSync(process.execPath, [copiedScript, template], { cwd: directory, encoding: "utf8" })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain("不支持契约关键字")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("空白模板合法，随包 schema 与公开产物同步", () => {
    const template = readFileSync(new URL("templates/progress.v1.json", skill), "utf8")
    expect(checkFile(template).status).toBe(0)
    expect(JSON.parse(readFileSync(new URL("references/progress.schema.json", skill)))).toEqual(publicSchema)
  })

  it("非法 JSON、缺失文件和缺少参数返回非零，不回显文件内容", () => {
    const result = checkFile('{"private-marker":')
    expect(result.status).toBe(1)
    expect(result.stderr).not.toContain("private-marker")
    expect(spawnSync(process.execPath, [fileURLToPath(script), "/missing/progress.json"]).status).toBe(1)
    expect(spawnSync(process.execPath, [fileURLToPath(script)]).status).toBe(2)
  })

  it("帮助无需安装依赖即可运行", () => {
    expect(execFileSync(process.execPath, [fileURLToPath(script), "--help"], { encoding: "utf8" })).toContain(
      "validate.mjs",
    )
  })
})
