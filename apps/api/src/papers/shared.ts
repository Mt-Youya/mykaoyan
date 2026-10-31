import { createHash, randomBytes } from "node:crypto"

import { BadRequestException, ForbiddenException } from "@nestjs/common"

import type { DatabaseService } from "../database"
/** 会话里的操作者；角色只作为提示，管理员权限每次都回库复核。 */
export type Actor = { id: string; role: string }

export type PaperOrigin = "admin" | "user"
export type PaperReviewStatus = "pending" | "approved" | "rejected"

export type PaperOption = { label: string; markdown: string }
export type QuestionRow = {
  number: number
  type: string
  score: number | null
  topics: string[] | null
  stemMarkdown: string
  options: unknown
}
export type QuestionAnswerRow = QuestionRow & {
  answerMarkdown: string
  analysisMarkdown: string | null
}

/** 试卷行：DTO 需要的字段；时间列同时接受 Date 与字符串（原生 SQL 返回字符串）。 */
export type PaperRow = {
  id: string
  slug: string
  title: string
  year: number
  subjectCode: string
  sourceNote: string | null
  origin: string
  reviewStatus: string
  listed: boolean
  ownerAccountId: string | null
  reviewReason: string | null
  reviewedAt: Date | string | null
  rightsConfirmedAt: Date | string | null
  createdAt: Date | string
}

export type PaperSummary = {
  slug: string
  title: string
  year: number
  subjectCode: string
  sourceNote: string | null
  origin: PaperOrigin
  questionCount: number
}
export type PaperQuestionPublic = {
  number: number
  type: string
  score: number | null
  topics: string[] | null
  stemMarkdown: string
  options: PaperOption[] | null
}
export type PaperDetail = PaperSummary & { questions: PaperQuestionPublic[] }
export type PaperAnswerQuestion = PaperQuestionPublic & {
  answerMarkdown: string
  analysisMarkdown: string | null
}
export type PaperAnswers = {
  slug: string
  title: string
  year: number
  origin: PaperOrigin
  questions: PaperAnswerQuestion[]
}

/** 分页固定每页 50 条，页码从 0 开始。 */
export const PAGE_SIZE = 50

export function parsePage(page: string | number): number {
  const value = typeof page === "number" ? page : Number(page)
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) throw new BadRequestException("页码无效")
  return value
}

export function options(value: unknown): PaperOption[] | null {
  return Array.isArray(value) ? (value as PaperOption[]) : null
}

export function originOf(value: string): PaperOrigin {
  return value === "user" ? "user" : "admin"
}

export function reviewStatusOf(value: string): PaperReviewStatus {
  return value === "pending" || value === "rejected" ? value : "approved"
}

/** 深排序对象键后的规范化 JSON：与管理员发布路径同一套规范化规则。 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .toSorted()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    )
  return value
}

/** 用户试卷内容指纹：对规范化后的提交输入取 SHA-256，仅用于审计，不对外暴露。 */
export function paperContentHash(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex")
}

/** 用户试卷标识：`u-` + 12 位小写十六进制随机串，服务端生成且全局唯一。 */
export function newPaperSlug(): string {
  return `u-${randomBytes(6).toString("hex")}`
}

/** 公开可见：已通过、已上架；用户试卷还要求社区开放。 */
export function publiclyVisible(row: Pick<PaperRow, "origin" | "reviewStatus" | "listed">, communityEnabled: boolean) {
  if (row.reviewStatus !== "approved" || !row.listed) return false
  return row.origin === "admin" || communityEnabled
}

export function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

/** 管理员权限回库复核：会话角色与数据库当前角色都必须是管理员。 */
export async function requireAdmin(database: DatabaseService, actor: Actor) {
  const [row] = await database.client<{ role: string }[]>`select role from accounts where id=${actor.id}`
  if (actor.role !== "admin" || row?.role !== "admin") throw new ForbiddenException("只有管理员能处理用户试卷审核")
}

/** 判断当前会话账号是否管理员（回库复核）；用于答案接口的预览例外。 */
export async function isAdmin(database: DatabaseService, actor: Actor): Promise<boolean> {
  if (actor.role !== "admin") return false
  const [row] = await database.client<{ role: string }[]>`select role from accounts where id=${actor.id}`
  return row?.role === "admin"
}
