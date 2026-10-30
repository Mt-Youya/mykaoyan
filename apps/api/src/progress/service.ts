import { BadRequestException, Inject, Injectable, PreconditionFailedException } from "@nestjs/common"

import { PROGRESS_FILE_APP, PROGRESS_FILE_VERSION, progressFileSchema, summarizeProgressChanges } from "@mykaoyan/core"
import type { ProgressFile } from "@mykaoyan/core"

import { DatabaseService } from "../database"

export type ProgressRevision = { revision: number; updatedAt: string; etag: string }

function etag(revision: number) {
  return `"revision-${revision}"`
}

function emptyProgressFile(): ProgressFile {
  return progressFileSchema.parse({
    app: PROGRESS_FILE_APP,
    version: PROGRESS_FILE_VERSION,
    revision: 0,
    updatedAt: new Date().toISOString(),
    updatedBy: "api",
    data: { profile: null, progress: [], mistakes: [], daily: [], dayPlans: [], weekly: [] },
  })
}

/** 账号隔离的进度文档读写；更新与历史快照放在同一事务。 */
@Injectable()
export class ProgressService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async read(accountId: string): Promise<{ document: ProgressFile; etag: string }> {
    const [row] = await this.database.client<{ document: unknown }[]>`
      select document from progress_documents where account_id = ${accountId}`
    const document = row ? progressFileSchema.parse(row.document) : emptyProgressFile()
    return { document, etag: etag(document.revision) }
  }

  async replace(accountId: string, ifMatch: string, input: unknown) {
    const parsed = progressFileSchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException("进度文件格式无效")

    return this.database.client.begin(async (sql) => {
      const [row] = await sql<{ document: unknown }[]>`
        select document from progress_documents where account_id = ${accountId} for update`
      const current = row ? progressFileSchema.parse(row.document) : emptyProgressFile()
      if (ifMatch !== etag(current.revision)) throw new PreconditionFailedException("进度文件已在其他位置更新")

      const next = progressFileSchema.parse({
        ...parsed.data,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: "site",
      })
      if (row) {
        await sql`
          update progress_documents
          set document = ${JSON.stringify(next)}::jsonb, revision = ${next.revision}, updated_at = now()
          where account_id = ${accountId}`
      } else {
        await sql`
          insert into progress_documents (account_id, document, revision)
          values (${accountId}, ${JSON.stringify(next)}::jsonb, ${next.revision})`
      }
      await sql`
        insert into progress_revisions (account_id, revision, document)
        values (${accountId}, ${next.revision}, ${JSON.stringify(next)}::jsonb)`

      return {
        app: PROGRESS_FILE_APP,
        version: PROGRESS_FILE_VERSION,
        etag: etag(next.revision),
        changes: summarizeProgressChanges(current.data, next.data),
      }
    })
  }

  async listRevisions(accountId: string): Promise<ProgressRevision[]> {
    const rows = await this.database.client<{ revision: number; updatedAt: string }[]>`
      select revision, document->>'updatedAt' as "updatedAt"
      from progress_revisions
      where account_id = ${accountId}
      order by revision desc`
    return rows.map((row) => ({ revision: row.revision, updatedAt: row.updatedAt, etag: etag(row.revision) }))
  }
}
