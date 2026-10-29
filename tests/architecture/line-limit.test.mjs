import { describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { checkLineLimit, generated, lines, linkedParent, sensitive } from "./line-limit.mjs"

const root = resolve(import.meta.dirname, "../..")

describe("全仓库手写文件行数守卫", () => {
  for (const count of [0, 1, 500, 501]) {
    for (const ending of ["", "\n", "\r\n"]) {
      it(`${count} 行、结尾 ${JSON.stringify(ending)} 按物理行计数`, () => {
        const source = count ? Array.from({ length: count }, () => "中文 text").join("\n") + ending : ""
        expect(lines(source)).toBe(count)
      })
    }
  }

  it("空行仍计数，末尾 LF 不多算一行", () => {
    expect(lines("\n\n")).toBe(2)
    expect(lines("\uFEFF中文\r\n\r\n最后一行")).toBe(3)
    expect(lines(Array.from({ length: 501 }, () => "中文").join("\r"))).toBe(501)
    expect(lines("第一行\r第二行\r")).toBe(2)
  })

  it("明确排除锁文件和同源生成产物", () => {
    for (const path of [
      "pnpm-lock.yaml",
      "cli/Cargo.lock",
      "cli/contracts/openapi.json",
      "skills/mykaoyan/references/progress.schema.json",
      "apps/web/public/schemas/progress/v1/progress.schema.json",
      "apps/web/public/openapi.json",
      "apps/web/src/routeTree.gen.ts",
      "packages/db/supabase/migrations/meta/20261029062941_snapshot.json",
      "packages/db/supabase/migrations/meta/_journal.json",
    ])
      expect(generated(path), path).toBe(true)
  })

  it("生成器、Rust、技能、脚本、文档和手写配置均不豁免", () => {
    for (const path of [
      "cli/build.rs",
      "cli/src/contract.rs",
      "packages/core/scripts/generate-contract.mjs",
      "skills/mykaoyan/SKILL.md",
      "skills/mykaoyan/validate.mjs",
      "skills/mykaoyan/templates/progress.v1.json",
      "scripts/link-skills.mjs",
      "tests/architecture/line-limit.mjs",
      "docs/PLAN.md",
      ".github/workflows/ci.yml",
      ".npmrc",
      "deploy/Caddyfile",
      "packages/db/supabase/migrations/20261029062941_rare_sister_grimm.sql",
      "packages/ui/src/base/sidebar.tsx",
      "packages/ui/components/ui/notes.md",
      "packages/ui/src/components/ui/button.test.tsx",
      "fictional/generated.json",
    ])
      expect(generated(path), path).toBe(false)
  })

  it("敏感路径在读取前拒绝，而不是靠豁免静默跳过", () => {
    for (const path of [
      ".env",
      "apps/api/.env.local",
      "apps/media-worker/.dev.vars",
      "tls/server.key",
      "content/private/fictional.json",
    ]) {
      expect(sensitive(path), path).toBe(true)
    }
    for (const path of [".npmrc", "apps/api/src/environment/environment.ts", "docs/ops/ecs-api-env.md"]) {
      expect(sensitive(path), path).toBe(false)
    }
  })

  it("父目录链接在读取前识别，不读取链接外部文件", () => {
    const directory = mkdtempSync(join(tmpdir(), "mykaoyan-line-limit-"))
    try {
      mkdirSync(join(directory, "outside"))
      mkdirSync(join(directory, "root"))
      symlinkSync(
        join(directory, "outside"),
        join(directory, "root/folder"),
        process.platform === "win32" ? "junction" : "dir"
      )
      expect(linkedParent(join(directory, "root"), "folder/fictional.md")).toBe(true)
      expect(linkedParent(join(directory, "root"), "missing/fictional.md")).toBe(false)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("已跟踪和未忽略新增的所有手写文本均不超过 500 行，技能链接不重复扫描", () => {
    const result = checkLineLimit(root)
    expect(result.errors).toEqual([])
    const paths = result.checked.map(({ path }) => path)
    for (const path of [
      "cli/build.rs",
      "scripts/link-skills.mjs",
      "skills/mykaoyan/SKILL.md",
      "docs/PLAN.md",
      ".npmrc",
    ]) {
      expect(paths).toContain(path)
    }
    expect(result.checked.length).toBeGreaterThan(400)
    expect(result.skipped.links).toEqual(expect.arrayContaining([".agents/skills/mykaoyan", ".claude/skills/mykaoyan"]))
  })
})
