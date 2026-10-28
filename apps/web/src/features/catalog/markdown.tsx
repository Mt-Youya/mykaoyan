import "katex/dist/katex.min.css"
import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

/**
 * Markdown 版式：@tailwindcss/typography 的 prose 负责排版尺度，
 * 下面把 typography 的调色变量整体映射到 DESIGN.md 令牌，再补少量结构覆盖。
 */
const proseClassName = [
  "prose mt-6 max-w-[46rem] wrap-break-word",
  // prose 默认是灰阶色板：正文/标题/链接/分隔线统一换成纸白、炭黑与次级文字。
  "[--tw-prose-body:var(--foreground)] [--tw-prose-headings:var(--foreground)] [--tw-prose-lead:var(--muted-foreground)] [--tw-prose-links:var(--foreground)] [--tw-prose-bold:var(--foreground)] [--tw-prose-counters:var(--muted-foreground)] [--tw-prose-bullets:var(--muted-foreground)] [--tw-prose-quotes:var(--muted-foreground)] [--tw-prose-quote-borders:var(--border)] [--tw-prose-captions:var(--muted-foreground)] [--tw-prose-kbd:var(--foreground)] [--tw-prose-code:var(--foreground)] [--tw-prose-pre-code:var(--foreground)] [--tw-prose-pre-bg:var(--muted)] [--tw-prose-th-borders:var(--border)] [--tw-prose-td-borders:var(--border)] [--tw-prose-hr:var(--border)]",
  // 标题用宋体；链接沿用正文色与常规字重（原来只有下划线）。
  "prose-headings:font-serif prose-a:font-normal prose-a:underline-offset-[0.2em]",
  // 行内代码：暖灰底、不显示 typography 默认的反引号。
  "prose-code:rounded-[0.3rem] prose-code:bg-muted prose-code:px-[0.35em] prose-code:py-[0.1em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  // 代码块：浅底细边框（typography 默认是深色块）。
  "prose-pre:rounded-[0.6rem] prose-pre:border prose-pre:border-border",
  // 引用：3px 竖线 + 次级文字，不倾斜、不加弯引号。
  "prose-blockquote:border-s-[3px] prose-blockquote:font-normal prose-blockquote:not-italic",
  "[&_blockquote>p:first-of-type::before]:content-none [&_blockquote>p:last-of-type::after]:content-none",
  // 表格：可横向滚动、单元格不换行、细网格线。
  "prose-table:block prose-table:overflow-x-auto prose-th:whitespace-nowrap prose-td:whitespace-nowrap prose-th:border prose-th:bg-muted prose-td:border",
  // GFM 任务列表：去掉项目符号，勾选框与文字基线对齐。
  "[&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-0 [&_li.task-list-item]:flex [&_li.task-list-item]:items-baseline [&_li.task-list-item]:gap-2 [&_li.task-list-item>input]:m-0 [&_li.task-list-item>input]:shrink-0",
  // KaTeX 行间公式可横向滚动，字号与原 .markdown 一致。
  "[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-[0.4rem] [&_.katex]:text-[1.05em]",
].join(" ")

/** 讲稿与讲义的 Markdown 渲染：GFM（表格、任务列表、删除线）与数学公式。 */
export function Markdown({ markdown }: { markdown: string }) {
  return (
    <div className={proseClassName}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
