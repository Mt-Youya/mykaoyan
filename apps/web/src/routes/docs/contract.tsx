import { createFileRoute } from "@tanstack/react-router"

export function ContractPage() {
  return (
    <main className="page-container py-section">
      <article className="max-w-[46rem]">
        <h1 className="font-serif text-section">公开契约</h1>
        <p className="mt-4">
          本站的进度文件格式和公开接口都只从一份 zod 定义生成。外部工具只依赖这里发布的契约，不依赖本站内部实现。
        </p>

        <h2 className="mt-12 border-b border-border pb-2 font-serif text-xl">契约地址</h2>
        <ul className="mt-4 grid list-disc gap-4 pl-5 marker:text-muted-foreground">
          <li>
            进度文件 JSON Schema：
            <a
              className="underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href="https://mykaoyan.cn/schemas/progress/v1/progress.schema.json"
            >
              下载
            </a>
            <br />
            <code className="wrap-anywhere font-mono text-sm text-muted-foreground">
              https://mykaoyan.cn/schemas/progress/v1/progress.schema.json
            </code>
          </li>
          <li>
            OpenAPI 3.1：
            <a
              className="underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href="https://mykaoyan.cn/openapi.json"
            >
              下载
            </a>
            <br />
            <code className="wrap-anywhere font-mono text-sm text-muted-foreground">
              https://mykaoyan.cn/openapi.json
            </code>
          </li>
        </ul>

        <p className="mt-6">
          进度接口（<code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">/api/v1/progress</code>
          ）要求登录后使用；它保存备考档案、考点、错题、每日记录、按天计划和周复盘。
        </p>

        <h2 className="mt-12 border-b border-border pb-2 font-serif text-xl">版本规则</h2>
        <p className="mt-4">
          兼容变更留在 v1：加字段、放宽约束不会改变版本号。改名、删字段、收紧约束属于破坏性变更，走 /v2/；v1
          至少保留一个大版本周期。
        </p>

        <h2 className="mt-12 border-b border-border pb-2 font-serif text-xl">用 curl 取 schema</h2>
        <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-muted p-4 font-mono text-sm leading-relaxed">
          <code>{"curl -sS https://mykaoyan.cn/schemas/progress/v1/progress.schema.json"}</code>
        </pre>

        <h2 className="mt-12 border-b border-border pb-2 font-serif text-xl">用 If-Match 上传进度文件</h2>
        <p className="mt-4">
          PUT 是整份替换：先 GET 拿 ETag，再把它放进 If-Match。缺少 If-Match 返回 428，不匹配返回
          412；成功后服务端追加一条历史版本。PUT 成功返回各类记录的新增、修改、删除条数，完整文件用 GET 取。
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-muted p-4 font-mono text-sm leading-relaxed">
          <code>{`export MYKAOYAN_TOKEN="..."

etag=$(curl -sI https://mykaoyan.cn/api/v1/progress \\
  -H "Authorization: Bearer $MYKAOYAN_TOKEN" \\
  | tr -d '\\r' | awk -F': ' 'tolower($1) == "etag" { print $2 }')

curl -sS -X PUT https://mykaoyan.cn/api/v1/progress \\
  -H "Authorization: Bearer $MYKAOYAN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "If-Match: $etag" \\
  --data-binary @progress.json`}</code>
        </pre>
        <p className="mt-4">网页上同样可以上传和下载进度文件，走同一套服务层。</p>

        <h2 className="mt-12 border-b border-border pb-2 font-serif text-xl">进度文件包含什么</h2>
        <p className="mt-4">
          包含备考档案、考点进度、错题与复测、每日记录、按天计划和周复盘；不包含私有内容和单词卡。稳定、待重测、下次复测日期与逾期天数由本站推算，不写入文件。
        </p>
      </article>
    </main>
  )
}

export const Route = createFileRoute("/docs/contract")({ component: ContractPage })
