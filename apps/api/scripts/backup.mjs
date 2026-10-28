import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import postgres from "postgres"
import { z } from "zod"

const required = z.string().trim().min(1)
const storageSchema = z.object({
  R2_ENDPOINT: z.url(),
  BACKUP_BUCKET: required,
  AWS_ACCESS_KEY_ID: required,
  AWS_SECRET_ACCESS_KEY: required,
  DATABASE_CA: required.optional(),
})

function storage(input) {
  const config = storageSchema.safeParse(input)
  if (!config.success) throw new Error("备份存储配置缺失或为空")
  const aws = (...args) =>
    execFileSync("aws", ["--endpoint-url", config.data.R2_ENDPOINT, "--region", "auto", "s3api", ...args], {
      env: { ...process.env, ...config.data },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  return { config: config.data, aws }
}

function connection(value, ca) {
  const url = new URL(value)
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("备份连接无效")
  const local = ["localhost", "127.0.0.1"].includes(url.hostname)
  if (!local && (url.searchParams.get("sslmode") !== "verify-full" || url.port !== "5432" || !ca)) {
    throw new Error("远程备份需要会话连接、完整 TLS 验证与 CA")
  }
  return postgres(url.href, { prepare: false, ssl: local ? false : { ca, rejectUnauthorized: true } })
}

async function counts(sql) {
  const tables = await sql`select schemaname, tablename from pg_tables
    where schemaname in ('public', 'supabase_migrations') order by schemaname, tablename`
  const result = {}
  for (const { schemaname, tablename } of tables) {
    // oxlint-disable-next-line no-await-in-loop -- 同一快照事务中串行统计，避免查询流水线串扰。
    const [row] = await sql`select count(*)::text as count from ${sql(schemaname)}.${sql(tablename)}`
    result[`${schemaname}.${tablename}`] = row.count
  }
  return result
}

const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex")

export async function backupDatabase(input) {
  const { config, aws } = storage(input)
  const sql = connection(input.BACKUP_DATABASE_URL, config.DATABASE_CA)
  const directory = mkdtempSync(join(tmpdir(), "mykaoyan-backup-"))
  try {
    const dump = join(directory, "database.dump")
    const manifestFile = join(directory, "manifest.json")
    const env = { ...process.env }
    if (config.DATABASE_CA) {
      const cert = join(directory, "ca.pem")
      writeFileSync(cert, config.DATABASE_CA, { mode: 0o600 })
      env.PGSSLROOTCERT = cert
    }
    const snapshotData = await sql.begin("isolation level repeatable read", async (transaction) => {
      const [snapshot] = await transaction`select pg_export_snapshot() as id`
      const result = await counts(transaction)
      const roles = await transaction`select rolname from pg_roles where rolname not like 'pg_%' order by rolname`
      const schemas = await transaction`select n.nspname as name,
        coalesce(array_agg(a.privilege_type order by a.privilege_type) filter (where a.grantee = 0), ARRAY[]::text[]) as "publicPrivileges"
        from pg_namespace n
        left join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a on true
        where n.nspname in ('public', 'supabase_migrations') group by n.nspname order by n.nspname`
      // 行数与 pg_dump 使用同一个快照，在线写入不会导致恢复比对误报。
      execFileSync(
        "pg_dump",
        [
          "--dbname",
          input.BACKUP_DATABASE_URL,
          "--format=custom",
          "--no-owner",
          "--schema=public",
          "--schema=supabase_migrations",
          "--snapshot",
          snapshot.id,
          "--file",
          dump,
        ],
        { env, stdio: ["ignore", "pipe", "pipe"] }
      )
      return { tables: result, roles: roles.map((role) => role.rolname), schemas }
    })
    const key = `database/${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`
    writeFileSync(manifestFile, JSON.stringify({ version: 1, sha256: digest(dump), ...snapshotData }), { mode: 0o600 })
    for (const [file, suffix] of [
      [dump, ".dump"],
      [manifestFile, ".json"],
    ]) {
      const sha256 = digest(file)
      aws(
        "put-object",
        "--bucket",
        config.BACKUP_BUCKET,
        "--key",
        key + suffix,
        "--body",
        file,
        "--metadata",
        `sha256=${sha256}`
      )
      const stored = JSON.parse(aws("head-object", "--bucket", config.BACKUP_BUCKET, "--key", key + suffix))
      if (stored.ContentLength !== statSync(file).size || stored.Metadata?.sha256 !== sha256) {
        throw new Error("备份写入后的读回校验失败")
      }
    }
    return key
  } finally {
    await sql.end({ timeout: 1 })
    rmSync(directory, { recursive: true })
  }
}

export async function restoreBackup(input) {
  const { config, aws } = storage(input)
  const target = new URL(input.RESTORE_DATABASE_URL)
  if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.pathname !== "/mykaoyan_restore_test") {
    throw new Error("恢复演练只允许专用的本机 mykaoyan_restore_test 空库")
  }
  if (!/^database\/[\w.:-]+$/.test(input.BACKUP_OBJECT_KEY ?? "")) throw new Error("备份对象 key 无效")
  const sql = connection(target.href)
  const directory = mkdtempSync(join(tmpdir(), "mykaoyan-restore-"))
  try {
    const [objects] = await sql`select count(*)::integer as count from (
      select relnamespace as namespace from pg_class
      union all select pronamespace from pg_proc
      union all select typnamespace from pg_type
    ) o join pg_namespace n on n.oid = o.namespace
    where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'`
    if (objects.count) throw new Error("恢复目标不是空库")
    const dump = join(directory, "database.dump")
    const manifestFile = join(directory, "manifest.json")
    for (const [file, suffix] of [
      [dump, ".dump"],
      [manifestFile, ".json"],
    ]) {
      aws("get-object", "--bucket", config.BACKUP_BUCKET, "--key", input.BACKUP_OBJECT_KEY + suffix, file)
    }
    const manifest = z
      .object({
        version: z.literal(1),
        sha256: required,
        tables: z.record(z.string(), z.string().regex(/^\d+$/)),
        roles: z.array(z.string().min(1).max(63)),
        schemas: z
          .array(
            z.object({
              name: z.enum(["public", "supabase_migrations"]),
              publicPrivileges: z.array(z.enum(["USAGE", "CREATE"])).max(2),
            })
          )
          .max(2)
          .refine((schemas) => new Set(schemas.map((schema) => schema.name)).size === schemas.length),
      })
      .parse(JSON.parse(readFileSync(manifestFile, "utf8")))
    if (manifest.sha256 !== digest(dump)) throw new Error("备份校验和不匹配")
    await Promise.all(
      [...new Set(manifest.roles)].map(async (role) => {
        const [existing] = await sql`select exists(select 1 from pg_roles where rolname = ${role}) as present`
        if (!existing.present) {
          await sql`create role ${sql(role)} nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls`
        }
      })
    )
    execFileSync(
      "pg_restore",
      ["--dbname", target.href, "--exit-on-error", "--clean", "--if-exists", "--no-owner", dump],
      { stdio: ["ignore", "pipe", "pipe"] }
    )
    // 重建 public schema 后，pg_restore 不一定重放其默认 PUBLIC 权限。
    await Promise.all(
      manifest.schemas.map(async ({ name, publicPrivileges }) => {
        await sql`revoke all on schema ${sql(name)} from public`
        if (publicPrivileges.length) {
          await sql`grant ${sql.unsafe(publicPrivileges.join(", "))} on schema ${sql(name)} to public`
        }
      })
    )
    const restored = await counts(sql)
    if (JSON.stringify(restored) !== JSON.stringify(manifest.tables)) throw new Error("恢复后的逐表行数不匹配")
    return restored
  } finally {
    await sql.end({ timeout: 1 })
    rmSync(directory, { recursive: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === "restore") {
      await restoreBackup(process.env)
      console.log("恢复演练完成，校验和与逐表行数一致。")
    } else if (process.argv[2] === "backup") {
      const key = await backupDatabase(process.env)
      console.log(`备份完成：${key}`)
    } else {
      throw new Error("需要指定 backup 或 restore")
    }
  } catch {
    console.error("备份或恢复失败，请检查配置与运行环境；连接配置不会写入日志。")
    process.exitCode = 1
  }
}
