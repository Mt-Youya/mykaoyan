const fs = require("node:fs")
const path = require("node:path")

const args = process.argv.slice(2)
const value = (name) => args[args.indexOf(name) + 1]
const file = path.join(process.env.FAKE_R2_DIR, value("--key"))
if (args.includes("put-object")) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.copyFileSync(value("--body"), file)
  fs.writeFileSync(`${file}.metadata`, JSON.stringify({ sha256: value("--metadata").split("=")[1] }))
} else if (args.includes("head-object")) {
  console.log(
    JSON.stringify({
      ContentLength: process.env.FAKE_R2_BAD_HEAD ? 0 : fs.statSync(file).size,
      Metadata: JSON.parse(fs.readFileSync(`${file}.metadata`, "utf8")),
    }),
  )
} else if (args.includes("get-object")) {
  fs.copyFileSync(file, args.at(-1))
} else {
  process.exitCode = 2
}
