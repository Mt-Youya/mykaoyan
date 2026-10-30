import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PROGRESS_FILE_APP, PROGRESS_FILE_VERSION, progressFileSchema } from "@mykaoyan/core"

import { ProgressView } from "./progress-page"
import type { ProgressViewProps } from "./progress-page"
import { summarizeUpload } from "./upload"

const document = progressFileSchema.parse({
  app: PROGRESS_FILE_APP,
  version: PROGRESS_FILE_VERSION,
  revision: 2,
  updatedAt: "2026-10-29T00:00:00.000Z",
  updatedBy: "site",
  data: { profile: null, progress: [], mistakes: [], daily: [], dayPlans: [], weekly: [] },
})

const noop = () => {}

function props(overrides: Partial<ProgressViewProps> = {}): ProgressViewProps {
  return {
    status: "ready",
    document,
    etag: '"revision-2"',
    message: "",
    pending: null,
    uploadError: "",
    revisions: [],
    revisionsError: "",
    busy: false,
    onDownload: noop,
    onPickFile: noop,
    onConfirm: noop,
    onCancel: noop,
    onReload: noop,
    ...overrides,
  }
}

describe("学习进度页", () => {
  it("未登录时只给登录入口", () => {
    const html = renderToStaticMarkup(<ProgressView {...props({ status: "unauthorized", document: null })} />)
    expect(html).toContain("登录后查看和替换云端学习数据")
    expect(html).toContain('href="/login"')
    expect(html).not.toContain("下载进度文件")
  })

  it("读取失败时展示服务端提示", () => {
    const html = renderToStaticMarkup(
      <ProgressView {...props({ status: "error", document: null, message: "学习数据暂不可用" })} />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain("学习数据暂不可用")
  })

  it("就绪时展示版本号、ETag、记录概览与上传入口", () => {
    const html = renderToStaticMarkup(<ProgressView {...props()} />)
    expect(html).toContain("学习进度")
    expect(html).toContain("第 2 版")
    expect(html).toContain("ETag：")
    expect(html).toContain("revision-2")
    expect(html).toContain("下载进度文件")
    expect(html).toContain("选择进度文件（JSON）")
    expect(html).toContain("历史版本")
    expect(html).toContain("还没有历史版本。")
  })

  it("选中文件后先展示变更摘要，再允许确认上传", () => {
    const summary = summarizeUpload(document, document)
    summary.changes.added.mistakes = 1
    const html = renderToStaticMarkup(
      <ProgressView
        {...props({
          pending: {
            fileName: "mykaoyan-progress-v2.json",
            document,
            summary,
          },
        })}
      />,
    )
    expect(html).toContain("待上传：")
    expect(html).toContain("mykaoyan-progress-v2.json")
    expect(html).toContain("错题")
    expect(html).toContain("确认上传")
    expect(html).toContain("放弃")
  })

  it("冲突提示会要求重新加载云端数据", () => {
    const html = renderToStaticMarkup(
      <ProgressView {...props({ message: "另一处已更新学习数据。请刷新后再修改，本次内容没有上传。" })} />,
    )
    expect(html).toContain("另一处已更新学习数据")
    expect(html).toContain("重新加载云端数据")
  })

  it("文件解析失败时展示上传错误", () => {
    const html = renderToStaticMarkup(<ProgressView {...props({ uploadError: "文件不是合法的 JSON" })} />)
    expect(html).toContain("文件不是合法的 JSON")
  })

  it("上传中禁用确认按钮并显示进度", () => {
    const summary = summarizeUpload(document, document)
    summary.changes.updated.daily = 1
    const html = renderToStaticMarkup(
      <ProgressView
        {...props({
          busy: true,
          pending: { fileName: "p.json", document, summary },
        })}
      />,
    )
    expect(html).toContain("正在上传…")
    expect(html).toContain("disabled")
    expect(html).toContain("每日记录")
  })
})
