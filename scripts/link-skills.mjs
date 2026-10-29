import { randomUUID } from "node:crypto"
import fs from "node:fs"
import { dirname, join, relative, resolve, sep, toNamespacedPath } from "node:path"
import { fileURLToPath } from "node:url"

const links = [
  [".agents/skills/mykaoyan", "../../skills/mykaoyan"],
  [".claude/skills/mykaoyan", "../../.agents/skills/mykaoyan"],
]

function directTarget(link) {
  return toNamespacedPath(resolve(dirname(link), fs.readlinkSync(link)))
}

function correct(link, source, target) {
  try {
    const direct =
      process.platform === "win32" ? directTarget(link) === toNamespacedPath(source) : fs.readlinkSync(link) === target
    return direct && fs.realpathSync(link) === fs.realpathSync(source)
  } catch {
    return false
  }
}

function checkParents(root, directory) {
  let parent = root
  for (const part of relative(root, directory).split(sep)) {
    parent = join(parent, part)
    const metadata = fs.lstatSync(parent, { throwIfNoEntry: false })
    if (metadata && (!metadata.isDirectory() || metadata.isSymbolicLink())) {
      throw new Error(`${relative(root, parent)} 不是仓库内真实目录，未修改技能入口`)
    }
  }
}

function createLink(target, destination, source) {
  try {
    fs.symlinkSync(target, destination, "dir")
    return "symlink"
  } catch (error) {
    if (process.platform !== "win32" || !["EPERM", "EACCES"].includes(error.code)) throw error
    // Win11 未启用开发者模式时，目录联接不需要创建符号链接的特权。
    fs.symlinkSync(source, destination, "junction")
    return "junction"
  }
}

function replaceLink(destination, source, target, existing) {
  const candidate = `${destination}.${randomUUID()}.link`
  const backup = `${destination}.${randomUUID()}.backup`
  let backedUp = false
  try {
    const kind = createLink(target, candidate, source)
    if (!correct(candidate, source, target)) throw new Error("候选技能链接校验失败")
    if (existing) {
      fs.renameSync(destination, backup)
      backedUp = true
    }
    try {
      fs.renameSync(candidate, destination)
    } catch (error) {
      if (backedUp) {
        fs.renameSync(backup, destination)
        backedUp = false
      }
      throw error
    }
    if (backedUp) fs.unlinkSync(backup)
    return kind
  } finally {
    if (fs.lstatSync(candidate, { throwIfNoEntry: false })) fs.unlinkSync(candidate)
  }
}

export function linkSkills(input = resolve(import.meta.dirname, "..")) {
  const root = fs.realpathSync(input)
  checkParents(root, join(root, "skills/mykaoyan"))
  if (!fs.lstatSync(join(root, "skills/mykaoyan/SKILL.md"), { throwIfNoEntry: false })?.isFile()) {
    throw new Error("缺少 skills/mykaoyan/SKILL.md，未修改技能入口")
  }
  // 两个入口一起预检：真实内容冲突时，另一入口也不发生变化。
  const plans = links.map(([path, target]) => {
    const destination = join(root, path)
    checkParents(root, dirname(destination))
    const source = resolve(dirname(destination), target)
    const existing = fs.lstatSync(destination, { throwIfNoEntry: false })
    if (existing && !existing.isSymbolicLink()) {
      const placeholder = existing.isFile() && existing.size < 1024 && fs.readFileSync(destination, "utf8")
      if (![target, `${target}\n`, `${target}\r\n`].includes(placeholder)) {
        throw new Error(`${path} 是真实目录或文件，未覆盖；请先自行迁移其内容`)
      }
    }
    return { path, destination, source, target, existing }
  })
  return plans.map(({ path, destination, source, target, existing }) => {
    if (existing?.isSymbolicLink() && correct(destination, source, target)) return { path, changed: false }
    fs.mkdirSync(dirname(destination), { recursive: true })
    return { path, changed: true, kind: replaceLink(destination, source, target, existing) }
  })
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    for (const { path, changed, kind } of linkSkills()) {
      console.log(`${path}：${changed ? `已创建 ${kind}` : "已指向同一份 skill"}`)
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
