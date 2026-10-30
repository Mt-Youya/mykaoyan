import type { z } from "zod"

import type { progressFileSchema } from "../schema"

/** 进度文件 fixture 的输入形状：日期与时间保持字符串，与公开契约一致。 */
export type ProgressFileInput = z.input<typeof progressFileSchema>

/** 单个 fixture；无效组的 value 故意不符合 schema。 */
export interface ProgressFixture {
  name: string
  value: unknown
}

/** 有效 fixture；value 必须符合进度文件 v1 的输入形状。 */
export interface ValidProgressFixture {
  name: string
  value: ProgressFileInput
}
