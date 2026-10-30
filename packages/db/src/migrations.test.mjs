import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { beforeAll, describe, expect, it } from "vitest"

const directory = resolve(import.meta.dirname, "../supabase/migrations")
const url = new URL(process.env.DATABASE_URL)
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test") {
  throw new Error("迁移测试只允许专用的本机 mykaoyan_test 临时库")
}
const sql = (query) =>
  execFileSync("psql", ["-XAt", "-v", "ON_ERROR_STOP=1", "-d", url.href, "-c", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()

const functionViolations = `
  select p.proname from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where n.nspname = 'public' and a.privilege_type = 'EXECUTE'
    and a.grantee in (0, (select oid from pg_roles where rolname = 'anon'),
      (select oid from pg_roles where rolname = 'authenticated'))
`

describe("空库迁移与权限", () => {
  beforeAll(() => {
    expect(sql("select count(*) from pg_tables where schemaname = 'public'")).toBe("0")
    sql("create role anon nologin; create role authenticated nologin;")
    const files = readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .toSorted()
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) sql(readFileSync(resolve(directory, file), "utf8"))
  })

  it("第一张表启用 RLS 且 anon、authenticated 没有表权限", () => {
    expect(sql("select relrowsecurity from pg_class where oid = 'public.courses'::regclass")).toBe("t")
    for (const role of ["anon", "authenticated"]) {
      expect(
        sql(
          `select has_table_privilege('${role}', 'public.courses', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`
        )
      ).toBe("f")
      expect(() => sql(`set role ${role}; select * from public.courses`)).toThrow()
    }
  })

  it("agent_tokens 启用 RLS 且 anon、authenticated 没有表权限", () => {
    expect(sql("select relrowsecurity from pg_class where oid = 'public.agent_tokens'::regclass")).toBe("t")
    for (const role of ["anon", "authenticated"]) {
      expect(
        sql(
          `select has_table_privilege('${role}', 'public.agent_tokens', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`
        )
      ).toBe("f")
    }
  })

  it("发布计划启用 RLS 且公开角色无权限，普通令牌默认不带发布权限", () => {
    expect(sql("select relrowsecurity from pg_class where oid = 'public.lesson_publications'::regclass")).toBe("t")
    for (const role of ["anon", "authenticated"])
      expect(
        sql(`select has_table_privilege('${role}', 'public.lesson_publications', 'SELECT,INSERT,UPDATE,DELETE')`)
      ).toBe("f")
    expect(
      sql(
        "select column_default from information_schema.columns where table_name='agent_tokens' and column_name='scope'"
      )
    ).toContain("progress")
  })

  it("会员期与兑换码开启RLS，公开角色不能读写", () => {
    for (const table of ["membership_periods", "redemption_codes"]) {
      expect(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`)).toBe("t")
      for (const role of ["anon", "authenticated"])
        expect(sql(`select has_table_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,DELETE')`)).toBe("f")
    }
  })

  it("评论、关键词和删除审计启用RLS且公开角色无权限", () => {
    for (const table of ["comments", "comment_keywords", "comment_deletions"]) {
      expect(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`)).toBe("t")
      for (const role of ["anon", "authenticated"])
        expect(sql(`select has_table_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,DELETE')`)).toBe("f")
    }
  })

  it("投稿元数据启用RLS且公开角色无权限", () => {
    expect(sql("select relrowsecurity from pg_class where oid='public.submissions'::regclass")).toBe("t")
    for (const role of ["anon", "authenticated"])
      expect(sql(`select has_table_privilege('${role}','public.submissions','SELECT,INSERT,UPDATE,DELETE')`)).toBe("f")
  })

  it("投稿评分启用RLS且公开角色无权限", () => {
    expect(sql("select relrowsecurity from pg_class where oid='public.submission_ratings'::regclass")).toBe("t")
    for (const role of ["anon", "authenticated"])
      expect(
        sql(`select has_table_privilege('${role}','public.submission_ratings','SELECT,INSERT,UPDATE,DELETE')`)
      ).toBe("f")
  })

  it("public schema 的函数没有向 PUBLIC、anon、authenticated 开放执行", () => {
    expect(sql(functionViolations)).toBe("")
  })

  it("权限断言能检出误授 PUBLIC 执行权的函数", () => {
    const result = sql(`begin;
      create function public.permission_mutation_probe() returns integer language sql as 'select 1';
      grant execute on function public.permission_mutation_probe() to public;
      ${functionViolations}; rollback;`)
    expect(result).toContain("permission_mutation_probe")
    expect(sql(functionViolations)).toBe("")
  })
})
