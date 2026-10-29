import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve, toNamespacedPath } from "node:path"
import { test } from "node:test"
import { linkSkills } from "./link-skills.mjs"

const entries = [".agents/skills/mykaoyan", ".claude/skills/mykaoyan"]
const targets = ["../../skills/mykaoyan", "../../.agents/skills/mykaoyan"]

function workspace(t) {
  const parent = fs.mkdtempSync(join(tmpdir(), "mykaoyan-links-"))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const root = join(parent, "仓库 with spaces")
  fs.mkdirSync(join(root, "skills/mykaoyan"), { recursive: true })
  fs.writeFileSync(join(root, "skills/mykaoyan/SKILL.md"), "fictional-skill")
  return root
}

function verify(root) {
  for (const entry of entries) {
    const link = join(root, entry)
    assert.ok(fs.lstatSync(link).isSymbolicLink())
    assert.equal(fs.realpathSync(link), fs.realpathSync(join(root, "skills/mykaoyan")))
    assert.equal(fs.readFileSync(join(link, "SKILL.md"), "utf8"), "fictional-skill")
    const target = targets[entries.indexOf(entry)]
    if (process.platform === "win32") {
      assert.equal(
        toNamespacedPath(resolve(dirname(link), fs.readlinkSync(link))),
        toNamespacedPath(resolve(dirname(link), target))
      )
    } else assert.equal(fs.readlinkSync(link), target)
  }
}

test("双入口共用来源，重复初始化不改写链接", (t) => {
  const root = workspace(t)
  assert.ok(linkSkills(root).every(({ changed }) => changed))
  verify(root)
  assert.ok(linkSkills(root).every(({ changed }) => !changed))
  fs.writeFileSync(join(root, "skills/mykaoyan/SKILL.md"), "updated-skill")
  for (const entry of entries) assert.equal(fs.readFileSync(join(root, entry, "SKILL.md"), "utf8"), "updated-skill")
})

test("修复 Git 在 Windows 检出的链接文本，兼容 CRLF", (t) => {
  const root = workspace(t)
  for (const [index, entry] of entries.entries()) {
    fs.mkdirSync(dirname(join(root, entry)), { recursive: true })
    fs.writeFileSync(join(root, entry), `${targets[index]}\r\n`)
  }
  linkSkills(root)
  verify(root)
})

test("仓库移动后重新初始化仍能找到来源", (t) => {
  const root = workspace(t)
  linkSkills(root)
  const moved = join(dirname(root), "relocated")
  fs.renameSync(root, moved)
  linkSkills(moved)
  verify(moved)
})

for (const directory of [true, false]) {
  test(`拒绝覆盖真实${directory ? "目录" : "文件"}`, (t) => {
    const root = workspace(t)
    const destination = join(root, entries[0])
    fs.mkdirSync(directory ? destination : dirname(destination), { recursive: true })
    const file = directory ? join(destination, "keep.txt") : destination
    fs.writeFileSync(file, "do-not-overwrite")
    assert.throws(() => linkSkills(root), /未覆盖/)
    assert.equal(fs.readFileSync(file, "utf8"), "do-not-overwrite")
  })
}

test("缺少技能来源时保留现有入口", (t) => {
  const root = workspace(t)
  const destination = join(root, entries[0])
  fs.mkdirSync(dirname(destination), { recursive: true })
  fs.writeFileSync(destination, targets[0])
  fs.unlinkSync(join(root, "skills/mykaoyan/SKILL.md"))
  assert.throws(() => linkSkills(root), /未修改/)
  assert.equal(fs.readFileSync(destination, "utf8"), targets[0])
})

test("初始化命令从仓库外运行，不依赖当前工作目录", (t) => {
  const root = workspace(t)
  fs.mkdirSync(join(root, "scripts"))
  fs.copyFileSync(new URL("./link-skills.mjs", import.meta.url), join(root, "scripts/link-skills.mjs"))
  const output = spawnSync(process.execPath, [join(root, "scripts/link-skills.mjs")], {
    cwd: tmpdir(),
    encoding: "utf8",
  })
  assert.equal(output.status, 0, output.stderr)
  verify(root)
})

for (const code of ["EPERM", "EACCES"]) {
  test(`Windows ${code} 回退 junction，移动后重建且不复制 skill`, { skip: process.platform !== "win32" }, (t) => {
    const root = workspace(t)
    const original = fs.symlinkSync
    t.mock.method(fs, "symlinkSync", (target, destination, kind) => {
      if (kind === "dir") throw Object.assign(new Error("fictional privilege failure"), { code })
      return original(target, destination, kind)
    })
    assert.ok(linkSkills(root).every(({ kind }) => kind === "junction"))
    verify(root)
    assert.ok(linkSkills(root).every(({ changed }) => !changed))
    const moved = join(dirname(root), "relocated-junction")
    fs.renameSync(root, moved)
    assert.ok(linkSkills(moved).every(({ kind }) => kind === "junction"))
    verify(moved)
  })
}

test("第二入口冲突时第一入口也不改写", (t) => {
  const root = workspace(t)
  fs.mkdirSync(join(root, entries[1]), { recursive: true })
  assert.throws(() => linkSkills(root), /未覆盖/)
  assert.equal(fs.lstatSync(join(root, entries[0]), { throwIfNoEntry: false }), undefined)
})

test("占位文本精确匹配，不删除带额外空白的真实文件", (t) => {
  const root = workspace(t)
  const destination = join(root, entries[0])
  fs.mkdirSync(dirname(destination), { recursive: true })
  const text = ` ${targets[0]}\n`
  fs.writeFileSync(destination, text)
  assert.throws(() => linkSkills(root), /未覆盖/)
  assert.equal(fs.readFileSync(destination, "utf8"), text)
})

test("不沿入口父目录链接修改仓库外文件", (t) => {
  const root = workspace(t)
  const outside = join(dirname(root), "outside")
  fs.mkdirSync(outside)
  const retained = join(outside, "mykaoyan")
  fs.writeFileSync(retained, targets[0])
  fs.mkdirSync(join(root, ".agents"))
  fs.symlinkSync(outside, join(root, ".agents/skills"), process.platform === "win32" ? "junction" : "dir")
  assert.throws(() => linkSkills(root), /真实目录/)
  assert.equal(fs.readFileSync(retained, "utf8"), targets[0])
})

test("修复直接指向源目录的 Claude 链接，保留 .claude → .agents 链", (t) => {
  const root = workspace(t)
  linkSkills(root)
  const destination = join(root, entries[1])
  fs.unlinkSync(destination)
  const source = join(root, "skills/mykaoyan")
  fs.symlinkSync(source, destination, process.platform === "win32" ? "junction" : "dir")
  assert.equal(linkSkills(root)[1].changed, true)
  verify(root)
})

test("新链接创建失败时保留 Git 占位文件", (t) => {
  const root = workspace(t)
  const destination = join(root, entries[0])
  fs.mkdirSync(dirname(destination), { recursive: true })
  fs.writeFileSync(destination, targets[0])
  t.mock.method(fs, "symlinkSync", () => {
    throw Object.assign(new Error("fictional failure"), { code: "EPERM" })
  })
  assert.throws(() => linkSkills(root), /fictional failure/)
  assert.equal(fs.readFileSync(destination, "utf8"), targets[0])
  assert.deepEqual(fs.readdirSync(dirname(destination)), ["mykaoyan"])
})

test("替换失败时恢复原入口，清理候选链接", (t) => {
  const root = workspace(t)
  const destination = join(root, entries[0])
  fs.mkdirSync(dirname(destination), { recursive: true })
  fs.writeFileSync(destination, targets[0])
  const original = fs.renameSync
  t.mock.method(fs, "renameSync", (from, to) => {
    if (from.endsWith(".link")) throw new Error("fictional rename failure")
    return original(from, to)
  })
  assert.throws(() => linkSkills(root), /fictional rename failure/)
  assert.equal(fs.readFileSync(destination, "utf8"), targets[0])
  assert.deepEqual(fs.readdirSync(dirname(destination)), ["mykaoyan"])
})
