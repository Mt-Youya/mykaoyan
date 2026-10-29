import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import { validProgressFixtures, invalidProgressFixtures } from "../../packages/core/src/progress/fixtures/index.ts"
const root = resolve(import.meta.dirname, "../..")
const binary = join(root, "cli/target/debug", process.platform === "win32" ? "mykaoyan.exe" : "mykaoyan")
beforeAll(() => {
  execFileSync("cargo", ["build", "--manifest-path", "cli/Cargo.toml", "--locked"], { cwd: root, stdio: "pipe" })
}, 180000)
describe("Rust CLI 的公开契约端到端校验", () => {
  for (const [fixtures, valid] of [
    [validProgressFixtures, true],
    [invalidProgressFixtures, false],
  ]) {
    for (const fixture of fixtures) {
      it(`${fixture.name} 与公开 fixture 结论一致`, () => {
        const directory = mkdtempSync(join(tmpdir(), "mykaoyan-cli-fixture-"))
        try {
          const file = join(directory, "progress.json")
          writeFileSync(file, JSON.stringify(fixture.value))
          const result = spawnSync(binary, ["--json", "progress", "validate", file], {
            cwd: directory,
            encoding: "utf8",
          })
          expect(result.status, result.stderr).toBe(valid ? 0 : 1)
          if (valid) expect(JSON.parse(result.stdout)).toEqual({ valid: true })
          else expect(JSON.parse(result.stderr).error).toBeTruthy()
        } finally {
          rmSync(directory, { recursive: true, force: true })
        }
      })
    }
  }
  it("CLI 的 OpenAPI 与网站公开契约完全一致", () => {
    expect(JSON.parse(readFileSync(join(root, "cli/contracts/openapi.json")))).toEqual(
      JSON.parse(readFileSync(join(root, "apps/web/public/openapi.json")))
    )
  })
})
