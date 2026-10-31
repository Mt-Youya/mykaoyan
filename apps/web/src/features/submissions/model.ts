import type { MembershipAccess } from "../membership"
import type { OwnSubmission, SubmissionKind } from "./api"
export const submissionStatus = { uploading: "上传未完成", pending: "待审核", approved: "已通过", rejected: "已驳回" }
export const submissionKind = { video: "视频", manuscript: "手稿" }
export type UploadEntryMode = "loading" | "login" | "open" | "error"
/** 投稿入口只按登录状态分流：访客先登录，非会员与会员都能打开表单。 */
export function uploadEntryMode(access: MembershipAccess): UploadEntryMode {
  if (access === "loading") return "loading"
  if (access === "error") return "error"
  return access === "guest" ? "login" : "open"
}
/** 字幕只在本人、视频、未审核且未进入清理流程时可以修改。 */
export function canEditSubtitles(item: OwnSubmission) {
  return item.kind === "video" && item.reviewedAt === null && !item.deleted && !item.deleteMarked
}
/** 清理状态提示：视频删对象与字幕，手稿清空正文，审核记录都保留。 */
export function submissionCleanupNote(item: {
  kind: SubmissionKind
  deleted: boolean
  deleteMarked: boolean
}): string | null {
  if (item.deleted) return item.kind === "manuscript" ? "正文已清理；审核记录保留。" : "原文件已清理；审核记录保留。"
  if (item.deleteMarked) return "等待清理，暂停播放。"
  return null
}
