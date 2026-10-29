import { PROGRESS_FILE_APP, PROGRESS_FILE_VERSION, progressFileSchema } from "@mykaoyan/core"
import type { ProgressFile } from "@mykaoyan/core"

const empty = {
  app: PROGRESS_FILE_APP,
  version: PROGRESS_FILE_VERSION,
  revision: 3,
  updatedAt: "2030-03-10T21:30:00+08:00",
  updatedBy: "site",
  data: { profile: null, progress: [], mistakes: [], daily: [], dayPlans: [], weekly: [] },
}

/** 学习页测试用的虚构进度文档；与公开 fixture 同形，只用于 SSR 渲染断言。 */
export const emptyStudyDocument: ProgressFile = progressFileSchema.parse(empty)

export const studyDocument: ProgressFile = progressFileSchema.parse({
  ...empty,
  data: {
    profile: {
      examDate: "2030-12-21",
      subjects: [
        { code: "302", name: "数学（二）", targetScore: 110 },
        { code: "408", name: "计算机学科专业基础", targetScore: 110 },
      ],
      otherMin: 10,
      phases: [
        {
          name: "基础阶段",
          start: "2030-01-07",
          end: "2030-06-30",
          weekday: { minutes: { "302": 90, "408": 60 }, flexMin: 20 },
          weekend: { minutes: { "302": 150, "408": 120 }, flexMin: 30 },
        },
      ],
    },
    progress: [
      { topicId: "M03", manual: "practiced", updatedAt: "2030-03-01T20:00:00+08:00" },
      { topicId: "D02", manual: "learning", updatedAt: "2030-03-02T20:00:00+08:00" },
    ],
    mistakes: [
      {
        id: "mistake-1",
        subject: "302",
        topicId: "M03",
        source: "虚构练习册",
        questionMd: "虚构题目",
        correctionMd: "虚构订正",
        causes: ["calculation"],
        correctedOn: "2030-03-01",
        retests: [
          { on: "2030-03-03", result: "independent" },
          { on: "2030-03-08", result: "independent" },
        ],
        createdAt: "2030-03-01T20:30:00+08:00",
      },
    ],
    daily: [
      {
        date: "2030-03-10",
        minutes: { "302": 120, "408": 90 },
        done: "虚构完成",
        tomorrowTop: "虚构首要任务",
        retro: "虚构复盘",
      },
    ],
    dayPlans: [{ date: "2030-03-10", minutes: { "302": 100, "408": 80 }, flexMin: 25 }],
    weekly: [{ weekStart: "2030-03-04", nextWeekAdjustment: "虚构调整" }],
  },
})
