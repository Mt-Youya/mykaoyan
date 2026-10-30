/*
 * `@mykaoyan/ui` 的公开入口。
 *
 * 按 ARCHITECTURE.md「跨领域只导入对方的入口文件」，apps/web 一律从这里按需引入组件，
 * 不深层导入 `src/base/*`；组件源码仍是 shadcn(base-ui) 生成物，不在这里重写。
 * 新增组件时在这里补一行导出。
 */
export { Badge, badgeVariants } from "./base/badge"
export { Button, buttonVariants } from "./base/button"
export { Input } from "./base/input"
export { Label } from "./base/label"

export { Field, FieldGroup, FieldLabel } from "./base/field"

export { Textarea } from "./base/textarea"
