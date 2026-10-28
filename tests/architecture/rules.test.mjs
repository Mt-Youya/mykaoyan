import { builtinModules } from "node:module"
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { API } from "typescript/unstable/sync"
import * as ts from "typescript/unstable/ast"
import { afterAll, describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "../..")
const json = (path) => JSON.parse(readFileSync(path, "utf8"))
const filesIn = (directory) =>
  existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if (["node_modules", "dist", ".output", ".wrangler", ".cloudflare", "target"].includes(entry.name)) return []
        const path = join(directory, entry.name)
        return entry.isDirectory() ? filesIn(path) : [path]
      })
    : []

const packages = ["apps", "packages"].flatMap((parent) => {
  const directory = join(root, parent)
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return existsSync(join(path, "package.json")) ? [{ path, manifest: json(join(path, "package.json")) }] : []
  })
})

const codeFiles = packages
  .flatMap(({ path }) => filesIn(path))
  .filter(
    (file) =>
      /\.(?:[cm]?[jt]sx?)$/.test(file) &&
      !file.endsWith("routeTree.gen.ts") &&
      !file.endsWith("worker-configuration.d.ts")
  )
const api = new API({ cwd: root })
const snapshot = api.updateSnapshot({ openFiles: codeFiles })
afterAll(() => {
  snapshot.dispose()
  api.close()
})

describe("仓库架构", () => {
  it("敏感配置、嵌套工具状态与构建产物不会进入 Git", () => {
    const paths = [
      "apps/api/.env.local",
      "apps/api/.env.example",
      "apps/media-worker/.dev.vars",
      "packages/db/supabase/.temp/cli-latest",
      "packages/db/supabase/.branches/fictional",
      "apps/web/.output/server/index.mjs",
      "apps/web/.cloudflare/output/v0/config.json",
      "apps/media-worker/.wrangler/state/fictional",
      "content/private/fictional.json",
      "packages/core/node_modules/fictional/index",
    ]
    const ignored = execFileSync("git", ["check-ignore", "--no-index", "--stdin"], {
      cwd: root,
      input: paths.join("\n") + "\n",
      encoding: "utf8",
    })
      .trim()
      .split("\n")
    expect(ignored).toEqual(paths)
  })

  it("根依赖仅包含全仓库工具，每个包参与聚合检查和构建", () => {
    const manifest = json(join(root, "package.json"))
    expect(Object.keys(manifest.dependencies ?? {})).toEqual([])
    expect(Object.keys(manifest.devDependencies).toSorted()).toEqual([
      "@types/node",
      "oxfmt",
      "oxlint",
      "tsx",
      "typescript",
      "vitest",
    ])
    expect(packages.length).toBeGreaterThan(0)
    for (const { path, manifest: pkg } of packages) {
      for (const script of ["typecheck", "test", "build"]) {
        expect(pkg.scripts?.[script], `${pkg.name} 缺少 ${script}`).toBeTruthy()
      }
      const declared = { ...pkg.dependencies, ...pkg.devDependencies }
      if (Object.values(pkg.scripts).some((script) => /\btsx\b/.test(script))) {
        expect(declared.tsx, `${pkg.name} 必须自行声明 tsx`).toBeTruthy()
      }
      const config = json(join(path, "tsconfig.json"))
      if (config.compilerOptions?.types?.includes("node")) {
        expect(declared["@types/node"], `${pkg.name} 必须自行声明 Node 类型`).toBeTruthy()
      }
    }
  })

  // ADR 0009：网页样式统一走 Tailwind v4 + shadcn，手写页面级 CSS 不再回来。
  it("网页样式只走 Tailwind + shadcn", () => {
    const webSource = filesIn(join(root, "apps/web/src"))
    const cssFiles = webSource.filter((file) => file.endsWith(".css")).map((file) => relative(root, file))
    expect(cssFiles, "apps/web 只允许 src/globals.css 一个 CSS 入口").toEqual(["apps/web/src/globals.css"])

    const inlineStyle = webSource
      .filter((file) => /\.tsx$/.test(file))
      .filter((file) => /\sstyle=\{\{/.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file))
    expect(inlineStyle, "样式不写在 JSX 内联 style 里").toEqual([])

    const handwrittenClass =
      /className=(?:"[^"]*|`[^`]*)\b(?:home-|study-|catalog-|admin-|lesson-|chapter-|player-|card-list)/
    const leftover = webSource
      .filter((file) => /\.tsx$/.test(file))
      .filter((file) => handwrittenClass.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file))
    expect(leftover, "旧手写 BEM 类名必须迁移为 Tailwind 工具类").toEqual([])
  })

  for (const { path, manifest } of packages) {
    for (const file of codeFiles.filter((item) => item.startsWith(path + "/"))) {
      it(relative(root, file), () => {
        const source = readFileSync(file, "utf8")
        expect(source.split("\n").length, "代码文件最多 500 行").toBeLessThanOrEqual(500)
        const ast = snapshot.getDefaultProjectForFile(file)?.program.getSourceFile(file)
        expect(ast, "TypeScript 必须解析每个受检文件").toBeTruthy()
        // 只约束 core 运行时代码；scripts/ 是仓库工具，需要 Node IO 生成公开契约。
        const isCore = manifest.name === "@mykaoyan/core" && file.includes("/src/") && !file.includes(".test.")
        const inspect = (node) => {
          if (isCore && ts.isIdentifier(node)) {
            expect(["fetch", "window", "document", "localStorage", "indexedDB"], "core 不依赖 IO").not.toContain(
              node.text
            )
          }
          const specifier =
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
              ? node.moduleSpecifier.text
              : ts.isCallExpression(node) &&
                  (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                    node.expression.getText(ast) === "require") &&
                  ts.isStringLiteral(node.arguments[0])
                ? node.arguments[0].text
                : undefined
          if (specifier) {
            if (specifier.startsWith(".")) {
              const destination = resolve(dirname(file), specifier)
              expect(relative(path, destination).startsWith(".."), "跨包只用包名导入").toBe(false)
              if (file.includes("/src/")) {
                const domain = relative(join(path, "src"), dirname(file)).split("/")[0]
                const targetPath = relative(join(path, "src"), destination)
                const target = targetPath.split("/")[0]
                // 根级文件是应用骨架（config、environment、database 等），不是领域；
                // 只有子目录之间才要求落到 index。
                if (domain && target !== domain && targetPath.includes("/")) {
                  // 跨领域只能落到目录入口：要么显式 index 文件，要么省略扩展名（bundler 解析到 index.ts）。
                  const isDirectory = statSync(destination, { throwIfNoEntry: false })?.isDirectory() ?? false
                  const entry = destination.endsWith(".ts")
                    ? destination
                    : destination.endsWith("")
                      ? destination.replace(/\.js$/, ".ts")
                      : isDirectory
                        ? join(destination, "index.ts")
                        : destination
                  expect(basename(entry), "跨领域只导入入口").toMatch(/^index\.[cm]?[jt]s$/)
                  expect(existsSync(entry), `${entry} 必须存在`).toBe(true)
                }
              }
            } else if (isCore) {
              expect(specifier, "core 只依赖 zod").toBe("zod")
            } else if (!builtinModules.includes(specifier) && !specifier.startsWith("node:")) {
              const name = specifier.startsWith("@")
                ? specifier.split("/").slice(0, 2).join("/")
                : specifier.split("/")[0]
              const declared = { ...manifest.dependencies, ...manifest.devDependencies }
              expect(name === "vitest" || name in declared, `${specifier} 必须由 ${manifest.name} 声明`).toBe(true)
              if (name.startsWith("@mykaoyan/")) {
                expect(specifier).toBe(name)
                if (name === "@mykaoyan/db") expect(manifest.name).toBe("@mykaoyan/api")
              }
            }
          }
          node.forEachChild(inspect)
        }
        inspect(ast)
      })
    }
  }
})
