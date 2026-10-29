import { z } from "zod"
import { subjectCodeSchema } from "../progress/index"

/** 考点元数据：只有编号、科目、名称与分组，不含真题原文、答案或课程内容。 */
export const topicSchema = z
  .strictObject({
    id: z
      .string()
      .regex(/^[A-Z]\d{2}$/)
      .describe("考点编号，例如 M03、D02。"),
    subject: subjectCodeSchema.describe("所属考试科目代码。"),
    title: z.string().regex(/\S/).describe("考点名称，只含公开大纲级元数据。"),
    part: z.string().regex(/\S/).optional().describe("多部分科目的分组，例如 408 的四门课程；不分组的科目省略。"),
  })
  .describe("考点元数据。")

export type Topic = z.infer<typeof topicSchema>

/**
 * 公开考点表：按官方考试大纲的知识单元整理，只有元数据。
 * 编号前缀按科目或课程分组：M 数学、D 数据结构、C 计算机组成原理、O 操作系统、N 计算机网络。
 */
export const publicTopics: readonly Topic[] = topicSchema.array().parse([
  { id: "M01", subject: "302", title: "函数、极限与连续" },
  { id: "M02", subject: "302", title: "一元函数微分学" },
  { id: "M03", subject: "302", title: "一元函数积分学" },
  { id: "M04", subject: "302", title: "多元函数微积分学" },
  { id: "M05", subject: "302", title: "常微分方程" },
  { id: "D01", subject: "408", part: "数据结构", title: "线性表" },
  { id: "D02", subject: "408", part: "数据结构", title: "栈、队列与数组" },
  { id: "D03", subject: "408", part: "数据结构", title: "树与二叉树" },
  { id: "D04", subject: "408", part: "数据结构", title: "图" },
  { id: "D05", subject: "408", part: "数据结构", title: "查找" },
  { id: "D06", subject: "408", part: "数据结构", title: "排序" },
  { id: "C01", subject: "408", part: "计算机组成原理", title: "计算机系统概述" },
  { id: "C02", subject: "408", part: "计算机组成原理", title: "数据的表示与运算" },
  { id: "C03", subject: "408", part: "计算机组成原理", title: "存储系统" },
  { id: "C04", subject: "408", part: "计算机组成原理", title: "指令系统" },
  { id: "C05", subject: "408", part: "计算机组成原理", title: "中央处理器" },
  { id: "C06", subject: "408", part: "计算机组成原理", title: "总线" },
  { id: "C07", subject: "408", part: "计算机组成原理", title: "输入/输出系统" },
  { id: "O01", subject: "408", part: "操作系统", title: "操作系统概述" },
  { id: "O02", subject: "408", part: "操作系统", title: "进程与线程" },
  { id: "O03", subject: "408", part: "操作系统", title: "内存管理" },
  { id: "O04", subject: "408", part: "操作系统", title: "文件管理" },
  { id: "O05", subject: "408", part: "操作系统", title: "输入/输出管理" },
  { id: "N01", subject: "408", part: "计算机网络", title: "计算机网络体系结构" },
  { id: "N02", subject: "408", part: "计算机网络", title: "物理层" },
  { id: "N03", subject: "408", part: "计算机网络", title: "数据链路层" },
  { id: "N04", subject: "408", part: "计算机网络", title: "网络层" },
  { id: "N05", subject: "408", part: "计算机网络", title: "传输层" },
  { id: "N06", subject: "408", part: "计算机网络", title: "应用层" },
])
