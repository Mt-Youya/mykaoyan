import { getDueRetests, getVocabCounts, toLocalDate } from "@mykaoyan/core"
import { useProgress } from "../progress"
import { useVocab } from "../vocab"

export function TodayPage() {
  const { status, document, message } = useProgress()
  const { data: vocab } = useVocab()
  const today = toLocalDate(new Date())
  const due = document ? getDueRetests(document.data.mistakes, today) : []
  const vocabCounts = vocab ? getVocabCounts(vocab, today) : null

  return (
    <main className="page-container py-section">
      <div className="mx-auto grid max-w-[52rem] gap-10">
        <header className="border-b border-border pb-8">
          <p className="text-sm tracking-[0.08em] text-muted-foreground">我的学习</p>
          <h1 className="mt-4 font-serif text-hero">今日页</h1>
          <p className="mt-5 text-muted-foreground">
            先处理逾期复测，再做今天的复测；单词卡只显示这个浏览器里的私有统计。
          </p>
        </header>
        {status === "loading" ? (
          <p role="status">正在汇总今日待办…</p>
        ) : status === "unauthorized" ? (
          <p>
            登录后查看云端学习待办。
            <a className="underline underline-offset-4" href="/login">
              去登录
            </a>
          </p>
        ) : status === "error" || !document ? (
          <p role="alert" className="border-l-2 border-destructive pl-3 text-destructive">
            {message || "学习数据暂不可用，请稍后重试。"}
          </p>
        ) : (
          <section>
            <h2 className="text-section">按顺序完成</h2>
            <ol className="mt-5 divide-y divide-border border-y border-border">
              {due.map(({ mistake, state }) => (
                <li key={mistake.id} className="py-4">
                  <strong>{state.overdueDays ? `逾期 ${state.overdueDays} 天的复测` : "今天的复测"}</strong>
                  <p className="mt-1 text-muted-foreground">
                    {mistake.subject} · {mistake.source || "未标注来源"} · 第 {state.attempt} 次
                  </p>
                  <a className="mt-2 inline-block underline underline-offset-4" href="/mistakes">
                    去复测
                  </a>
                </li>
              ))}
              {vocabCounts?.due ? (
                <li className="py-4">
                  <strong>到期单词卡 {vocabCounts.due} 张</strong>
                  <p className="mt-1 text-muted-foreground">先清空到期卡，再开始新卡。</p>
                  <a className="mt-2 inline-block underline underline-offset-4" href="/vocabulary">
                    去背单词
                  </a>
                </li>
              ) : null}
              {vocabCounts?.newAvailable ? (
                <li className="py-4">
                  <strong>可引入新卡 {vocabCounts.newAvailable} 张</strong>
                  <p className="mt-1 text-muted-foreground">每天最多 30 张新卡。</p>
                  <a className="mt-2 inline-block underline underline-offset-4" href="/vocabulary">
                    去背单词
                  </a>
                </li>
              ) : null}
              {due.length === 0 && !vocabCounts?.due && !vocabCounts?.newAvailable ? (
                <li className="py-4 text-muted-foreground">今天没有待处理的复测或单词卡。</li>
              ) : null}
            </ol>
          </section>
        )}
      </div>
    </main>
  )
}
