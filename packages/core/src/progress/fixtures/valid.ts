import { PROGRESS_FILE_APP, PROGRESS_FILE_VERSION } from "../schema"
import type { ValidProgressFixture } from "./types"

/** 空白进度文件：尚未建立备考档案，五类记录都为空。全部为虚构数据。 */
export const emptyProgressFileFixture: ValidProgressFixture = {
  name: "empty",
  value: {
    app: PROGRESS_FILE_APP,
    version: PROGRESS_FILE_VERSION,
    revision: 0,
    updatedAt: "2030-01-01T00:00:00.000Z",
    updatedBy: "site",
    data: {
      profile: null,
      progress: [],
      mistakes: [],
      daily: [],
      dayPlans: [],
      weekly: [],
    },
  },
}

/** 完整进度文件：档案、考点进度、错题（含两次独立完成的复测）、每日记录、按天计划、周复盘各一条。全部为虚构数据。 */
export const fullProgressFileFixture: ValidProgressFixture = {
  name: "full",
  value: {
    $schema: "https://mykaoyan.cn/schemas/progress/v1/progress.schema.json",
    app: PROGRESS_FILE_APP,
    version: PROGRESS_FILE_VERSION,
    revision: 3,
    updatedAt: "2030-03-10T21:30:00+08:00",
    updatedBy: "agent:example",
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
            name: "虚构基础阶段",
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
          id: "mistake-fictional-1",
          legacyId: "虚构旧编号-1",
          subject: "302",
          topicId: "M03",
          source: "虚构练习册",
          questionMd: "虚构题目：验证一个虚构函数在虚构区间上的单调性。",
          attemptMd: "虚构作答：按虚构条件写错了单调区间。",
          firstWrongStep: "虚构第一步：把虚构区间的端点算错。",
          causes: ["concept", "calculation"],
          correctionMd: "虚构订正：重新列出虚构条件，不含任何真实题目或答案。",
          keyCondition: "虚构关键条件：区间端点。",
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
          done: "虚构完成：两节虚构练习。",
          tomorrowTop: "虚构首要任务：重做一道虚构错题。",
          retro: "虚构复盘：虚构条件读得慢，明天先读条件。",
        },
      ],
      dayPlans: [{ date: "2030-03-10", minutes: { "302": 100, "408": 80 }, flexMin: 25 }],
      weekly: [{ weekStart: "2030-03-04", nextWeekAdjustment: "虚构调整：下周每天多留 10 分钟弹性时间。" }],
    },
  },
}

/** 有效 fixture 组。 */
export const validProgressFixtures: readonly ValidProgressFixture[] = [
  emptyProgressFileFixture,
  fullProgressFileFixture,
]
