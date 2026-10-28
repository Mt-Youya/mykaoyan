import { afterAll, beforeAll, expect, it } from "vitest"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postgres from "postgres"
import { backupDatabase, restoreBackup } from "../scripts/backup.mjs"

let sql
let directory
let input
let restoreCreated = false
let migrationSchemaCreated = false
let serviceRoleCreated = false
const originalPath = process.env.PATH

beforeAll(async () => {
  const source = new URL(process.env.DATABASE_URL)
  if (!["127.0.0.1", "localhost"].includes(source.hostname) || source.pathname !== "/mykaoyan_test") {
    throw new Error("备份测试只允许专用本机临时库")
  }
  sql = postgres(source.href, { prepare: false })
  await sql`create table public.backup_probe (value integer not null)`
  await sql`insert into public.backup_probe values (2), (7)`
  await sql`create role service_role nologin`
  serviceRoleCreated = true
  await sql`grant select on public.backup_probe to service_role`
  const [schema] = await sql`select exists(select 1 from pg_namespace where nspname = 'supabase_migrations') as present`
  migrationSchemaCreated = !schema.present
  await sql`create schema if not exists supabase_migrations`
  await sql`create table supabase_migrations.backup_probe (version text not null)`
  await sql`insert into supabase_migrations.backup_probe values ('fictional-version')`
  await sql.unsafe("create database mykaoyan_restore_test")
  restoreCreated = true
  directory = mkdtempSync(join(tmpdir(), "mykaoyan-fake-r2-"))
  const aws = join(directory, "aws")
  writeFileSync(aws, "#!/usr/bin/env node\n" + readFileSync(new URL("./fixtures/aws.cjs", import.meta.url), "utf8"))
  chmodSync(aws, 0o700)
  process.env.PATH = directory + ":" + originalPath
  process.env.FAKE_R2_DIR = directory
  const target = new URL(source)
  target.pathname = "/mykaoyan_restore_test"
  input = {
    BACKUP_DATABASE_URL: source.href,
    RESTORE_DATABASE_URL: target.href,
    R2_ENDPOINT: "https://storage.invalid",
    BACKUP_BUCKET: "fictional-backups",
    AWS_ACCESS_KEY_ID: "fictional",
    AWS_SECRET_ACCESS_KEY: "fictional",
  }
})

afterAll(async () => {
  process.env.PATH = originalPath
  delete process.env.FAKE_R2_DIR
  delete process.env.FAKE_R2_BAD_HEAD
  if (sql) {
    await sql`drop table if exists public.backup_probe`
    await sql`drop table if exists supabase_migrations.backup_probe`
    if (migrationSchemaCreated) await sql`drop schema supabase_migrations`
    if (restoreCreated) await sql.unsafe("drop database mykaoyan_restore_test with (force)")
    const [role] = await sql`select exists(select 1 from pg_roles where rolname = 'service_role') as present`
    if (serviceRoleCreated && role.present) await sql`drop role service_role`
    await sql.end()
  }
  if (directory) rmSync(directory, { recursive: true })
})

it("真实 dump/restore 往返保留逐表行数，并拒绝损坏备份和非空目标", async () => {
  const started = performance.now()
  const key = await backupDatabase(input)
  await sql`revoke select on public.backup_probe from service_role`
  await sql`drop role service_role`
  const restoreInput = { ...input, BACKUP_OBJECT_KEY: key }
  const dump = join(directory, key + ".dump")
  const original = readFileSync(dump)
  writeFileSync(dump, "corrupted")
  await expect(restoreBackup(restoreInput)).rejects.toThrow("校验和")
  writeFileSync(dump, original)
  const restored = await restoreBackup(restoreInput)
  expect(restored["public.backup_probe"]).toBe("2")
  expect(restored["supabase_migrations.backup_probe"]).toBe("1")
  const restoredDb = postgres(input.RESTORE_DATABASE_URL, { prepare: false })
  try {
    const rows = await restoredDb.begin(async (transaction) => {
      await transaction`set local role service_role`
      return transaction`select value from public.backup_probe order by value`
    })
    expect(rows.map((row) => row.value)).toEqual([2, 7])
  } finally {
    await restoredDb.end()
  }
  await expect(restoreBackup(restoreInput)).rejects.toThrow("不是空库")
  console.log(`本机恢复演练完成：${Math.round(performance.now() - started)}ms；虚构表 2 行一致（R2 使用 CLI 替身）`)
})

it("上传成功但对象读回不匹配时仍判定备份失败", async () => {
  process.env.FAKE_R2_BAD_HEAD = "1"
  try {
    await expect(backupDatabase(input)).rejects.toThrow("读回校验失败")
  } finally {
    delete process.env.FAKE_R2_BAD_HEAD
  }
})

it("拒绝缺失配置和指向其他库的恢复请求", async () => {
  await expect(backupDatabase({})).rejects.toThrow("配置缺失")
  await expect(restoreBackup({ ...input, RESTORE_DATABASE_URL: input.BACKUP_DATABASE_URL })).rejects.toThrow(
    "恢复演练只允许"
  )
})
