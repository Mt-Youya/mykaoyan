#!/usr/bin/env node
// 仅实现随包公开契约使用的 JSON Schema 关键字；不接受未知约束。
import { readFileSync } from "node:fs"

const supported = new Set([
  "$schema",
  "$id",
  "description",
  "type",
  "const",
  "enum",
  "anyOf",
  "minimum",
  "maximum",
  "pattern",
  "format",
  "required",
  "properties",
  "additionalProperties",
  "propertyNames",
  "items",
])

function inspectSchema(schema) {
  for (const key of Object.keys(schema)) {
    if (!supported.has(key)) throw new Error(`校验器不支持契约关键字 ${key}`)
  }
  if (schema.format && !["date", "date-time"].includes(schema.format)) throw new Error("不支持的日期格式")
  for (const child of Object.values(schema.properties ?? {})) inspectSchema(child)
  for (const child of schema.anyOf ?? []) inspectSchema(child)
  for (const key of ["items", "propertyNames", "additionalProperties"]) {
    if (typeof schema[key] === "object") inspectSchema(schema[key])
  }
}

function matchesType(value, type) {
  switch (type) {
    case "null":
      return value === null
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value)
    case "array":
      return Array.isArray(value)
    case "integer":
      return Number.isInteger(value)
    case "number":
      return typeof value === "number" && Number.isFinite(value)
    case "string":
      return typeof value === "string"
    default:
      throw new Error(`不支持的契约类型 ${type}`)
  }
}

function errorsAt(value, schema, path = "$") {
  const errors = []
  const fail = (rule) => errors.push(`${path}: ${rule}`)
  if (schema.type && !matchesType(value, schema.type)) return [`${path}: 类型应为 ${schema.type}`]
  if (Object.hasOwn(schema, "const") && value !== schema.const) fail("固定值不匹配")
  if (schema.enum && !schema.enum.includes(value)) fail("不在允许值中")
  if (schema.anyOf && !schema.anyOf.some((child) => errorsAt(value, child, path).length === 0))
    fail("不符合任一允许格式")
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) fail("小于最小值")
    if (schema.maximum !== undefined && value > schema.maximum) fail("大于最大值")
  }
  // 公开契约的日期和时间 pattern 已包含闰年、月份、时区等约束。
  if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) fail("文本格式不符")
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => errors.push(...errorsAt(item, schema.items, `${path}[${index}]`)))
  }
  if (matchesType(value, "object")) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) fail(`缺少字段 ${key}`)
    }
    for (const [key, item] of Object.entries(value)) {
      // 不将任意输入的字段名回显到终端，避免意外泄露私有文本。
      if (schema.propertyNames) errors.push(...errorsAt(key, schema.propertyNames, `${path}.*`))
      if (schema.properties && Object.hasOwn(schema.properties, key)) {
        errors.push(...errorsAt(item, schema.properties[key], `${path}.${key}`))
      } else if (schema.additionalProperties === false) fail("存在未知字段")
      else if (typeof schema.additionalProperties === "object") {
        errors.push(...errorsAt(item, schema.additionalProperties, `${path}.*`))
      }
    }
  }
  return errors
}

const [file, ...extra] = process.argv.slice(2)
if (file === "--help" && extra.length === 0) {
  console.log("用法：node validate.mjs <进度文件.json>；退出码 0 合法，1 校验或读取失败，2 参数错误。")
} else if (!file || extra.length) {
  console.error("用法：node validate.mjs <进度文件.json>")
  process.exitCode = 2
} else {
  try {
    const schema = JSON.parse(readFileSync(new URL("./references/progress.schema.json", import.meta.url), "utf8"))
    inspectSchema(schema)
    let value
    try {
      value = JSON.parse(readFileSync(file, "utf8"))
    } catch {
      throw new Error("无法读取进度文件或 JSON 格式无效")
    }
    const errors = errorsAt(value, schema)
    if (errors.length) {
      console.error(`进度文件校验失败：\n${errors.slice(0, 20).join("\n")}`)
      process.exitCode = 1
    } else console.log("进度文件校验通过（v1）")
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
