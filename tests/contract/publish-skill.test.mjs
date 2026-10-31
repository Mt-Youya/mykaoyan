import { existsSync, readFileSync, realpathSync } from "node:fs"

import { describe, expect, it } from "vitest"

const skill = new URL("../../skills/mykaoyan-publish/", import.meta.url)

describe("mykaoyan-publish 管理员发布 skill", () => {
  it("双入口指向同一份 skill，入口只路由按需资料", () => {
    for (const path of ["../../.agents/skills/mykaoyan-publish/", "../../.claude/skills/mykaoyan-publish/"]) {
      expect(realpathSync(new URL(path, import.meta.url))).toBe(realpathSync(skill))
    }
    const entry = readFileSync(new URL("SKILL.md", skill), "utf8")
    expect(entry).toMatch(/name: mykaoyan-publish/)
    expect(entry).toMatch(/^compatibility:/m)
    expect(entry).toContain("scope=publish")
    expect(entry).toContain("--dry-run")
    expect(entry).toContain("mykaoyan --json publish")
    expect(entry).toContain("publish-handout")
    expect(entry).toContain("publish-paper")
    expect(entry).toContain("上架状态")
    expect(entry).toContain("不能写进命令参数")
    expect(entry).toContain("不用于考生进度文件")
    expect(entry).not.toContain("curl --")
    expect(entry).not.toContain("--request PUT")
    for (const [, target] of entry.matchAll(/\]\(([^)]+)\)/g)) {
      expect(target).toMatch(/^(references|templates)\/[^/]+$/)
      expect(existsSync(new URL(target, skill)), target).toBe(true)
    }
    const reference = readFileSync(new URL("references/publishing.md", skill), "utf8")
    for (const command of ["mykaoyan --json publish ", "publish-handout", "publish-paper"]) {
      expect(reference).toContain(command)
    }
    expect(reference).toContain("schemas/publish/v1/handout.schema.json")
    expect(reference).toContain("schemas/publish/v1/paper.schema.json")
    expect(reference).toContain("OpenAPI")
    expect(reference).toContain("JSON Schema")
    expect(reference).toContain("cleanupPending")
    expect(reference).toContain("题号唯一且严格升序")
    expect(reference).toContain("不读取答案类文件内容")
    expect(reference).not.toContain("curl --")
  })
})
