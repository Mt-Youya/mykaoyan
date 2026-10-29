import { execFileSync } from "node:child_process"
import { lstatSync, readFileSync } from "node:fs"
import { join } from "node:path"

const generatedFiles = new Set([
  "pnpm-lock.yaml",
  "cli/Cargo.lock",
  "cli/contracts/openapi.json",
  "apps/web/public/openapi.json",
  "apps/web/public/schemas/progress/v1/progress.schema.json",
  "skills/mykaoyan/references/progress.schema.json",
  "apps/web/src/routeTree.gen.ts",
])

export function generated(path) {
  return (
    generatedFiles.has(path) ||
    /^packages\/db\/supabase\/migrations\/meta\/(?:\d+_snapshot|_journal)\.json$/.test(path) ||
    /^apps\/media-worker\/worker-configuration\.d\.ts$/.test(path)
  )
}

export function sensitive(path) {
  return (
    /(?:^|\/)\.(?:env|dev\.vars)(?:\.|$)/.test(path) ||
    /\.(?:key|pem)$/.test(path) ||
    path.startsWith("content/private/")
  )
}

export function lines(source) {
  if (source.length === 0) return 0
  return source.split(/\r\n|\n|\r/).length - (/[\r\n]$/.test(source) ? 1 : 0)
}

export function repositoryPaths(root) {
  return [
    ...new Set(
      execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
        cwd: root,
        encoding: "utf8",
      })
        .split("\0")
        .filter(Boolean)
    ),
  ].toSorted()
}

export function linkedParent(root, path) {
  let parent = root
  for (const part of path.split("/").slice(0, -1)) {
    parent = join(parent, part)
    if (lstatSync(parent, { throwIfNoEntry: false })?.isSymbolicLink()) return true
  }
  return false
}

export function checkLineLimit(root) {
  const checked = []
  const skipped = { generated: [], links: [], binary: [] }
  const errors = []
  for (const path of repositoryPaths(root)) {
    if (sensitive(path)) {
      errors.push(`${path}：敏感路径不能进入仓库，未读取内容`)
      continue
    }
    if (linkedParent(root, path)) {
      skipped.links.push(path)
      continue
    }
    const file = join(root, path)
    const metadata = lstatSync(file, { throwIfNoEntry: false })
    if (!metadata) {
      errors.push(`${path}：受检文件缺失`)
      continue
    }
    if (metadata.isSymbolicLink()) {
      skipped.links.push(path)
      continue
    }
    if (generated(path)) {
      skipped.generated.push(path)
      continue
    }
    if (!metadata.isFile()) {
      errors.push(`${path}：不是普通文件或链接`)
      continue
    }
    const bytes = readFileSync(file)
    if (bytes.includes(0)) {
      skipped.binary.push(path)
      continue
    }
    let source
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
      errors.push(`${path}：文本不是有效 UTF-8`)
      continue
    }
    const count = lines(source)
    checked.push({ path, lines: count })
    if (count > 500) errors.push(`${path}：${count} 行，手写文件最多 500 行`)
  }
  return { checked, skipped, errors }
}
