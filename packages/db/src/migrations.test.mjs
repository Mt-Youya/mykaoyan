import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

const directory = resolve(import.meta.dirname, "../supabase/migrations")
const url = new URL(process.env.DATABASE_URL)
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/mykaoyan_test") {
  throw new Error("迁移测试只允许专用的本机 mykaoyan_test 临时库")
}
const sql = (query) =>
  execFileSync("psql", ["-XAtq", "-v", "ON_ERROR_STOP=1", "-d", url.href, "-c", query], {
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
          `select has_table_privilege('${role}', 'public.courses', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,
        ),
      ).toBe("f")
      expect(() => sql(`set role ${role}; select * from public.courses`)).toThrow()
    }
  })

  it("agent_tokens 启用 RLS 且 anon、authenticated 没有表权限", () => {
    expect(sql("select relrowsecurity from pg_class where oid = 'public.agent_tokens'::regclass")).toBe("t")
    for (const role of ["anon", "authenticated"]) {
      expect(
        sql(
          `select has_table_privilege('${role}', 'public.agent_tokens', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,
        ),
      ).toBe("f")
    }
  })

  it("发布计划启用 RLS 且公开角色无权限，普通令牌默认不带发布权限", () => {
    expect(sql("select relrowsecurity from pg_class where oid = 'public.lesson_publications'::regclass")).toBe("t")
    for (const role of ["anon", "authenticated"])
      expect(
        sql(`select has_table_privilege('${role}', 'public.lesson_publications', 'SELECT,INSERT,UPDATE,DELETE')`),
      ).toBe("f")
    expect(
      sql(
        "select column_default from information_schema.columns where table_name='agent_tokens' and column_name='scope'",
      ),
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
        sql(`select has_table_privilege('${role}','public.submission_ratings','SELECT,INSERT,UPDATE,DELETE')`),
      ).toBe("f")
  })

  it("投稿评论与删除审计启用RLS且公开角色无权限", () => {
    for (const table of ["submission_comments", "submission_comment_deletions"]) {
      expect(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`)).toBe("t")
      for (const role of ["anon", "authenticated"])
        expect(sql(`select has_table_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,DELETE')`)).toBe("f")
    }
  })

  it("试卷与试卷题目启用RLS，公开角色无权限", () => {
    for (const table of ["papers", "paper_questions"]) {
      expect(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`)).toBe("t")
      for (const role of ["anon", "authenticated"])
        expect(
          sql(
            `select has_table_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,
          ),
        ).toBe("f")
    }
  })

  it("字幕、试卷评论与删除审计启用RLS且公开角色无权限", () => {
    for (const table of ["submission_subtitles", "paper_comments", "paper_comment_deletions"]) {
      expect(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`)).toBe("t")
      for (const role of ["anon", "authenticated"])
        expect(
          sql(
            `select has_table_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,
          ),
        ).toBe("f")
    }
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

const accountId = "30000000-0000-4000-8000-000000000001"
const videoId = "30000000-0000-4000-8000-000000000002"
const manuscriptId = "30000000-0000-4000-8000-000000000003"
const pendingPaperId = "30000000-0000-4000-8000-000000000004"
const approvedPaperId = "30000000-0000-4000-8000-000000000005"

describe("用户内容迁移的约束与级联", () => {
  it("submissions 按 kind 收紧字段组合，既有视频行默认 kind='video'", () => {
    sql(`insert into submissions (id,title,summary,subject_code,size,duration,fingerprint,object_key)
      values ('${videoId}','虚构视频投稿','','302',100,10,repeat('a',64),'fictional/user-content/video.mp4')`)
    expect(sql(`select kind from submissions where id='${videoId}'`)).toBe("video")
    sql(`insert into submissions (id,title,summary,subject_code,kind,status,fingerprint,manuscript_markdown)
      values ('${manuscriptId}','虚构手稿投稿','','302','manuscript','pending',repeat('a',64),'虚构手稿正文')`)
    expect(sql(`select kind from submissions where id='${manuscriptId}'`)).toBe("manuscript")
    // 驳回清理后正文可空，但必须留下 deleted_at 与审核记录。
    sql(`insert into submissions (id,title,summary,subject_code,kind,status,reviewed_at,reason,deleted_at,fingerprint)
      values ('30000000-0000-4000-8000-000000000006','虚构已清理手稿','','302','manuscript','rejected',now(),'虚构驳回原因',now(),repeat('b',64))`)

    expect(() =>
      sql(`insert into submissions (id,title,summary,subject_code,kind,fingerprint,object_key)
        values ('30000000-0000-4000-8000-000000000011','虚构视频','','302','video',repeat('a',64),'fictional/user-content/missing-size.mp4')`),
    ).toThrow()
    expect(() =>
      sql(`insert into submissions (id,title,summary,subject_code,kind,size,duration,fingerprint,object_key)
        values ('30000000-0000-4000-8000-000000000012','虚构音频','','302','audio',100,10,repeat('a',64),'fictional/user-content/audio.mp3')`),
    ).toThrow()
    expect(() =>
      sql(`insert into submissions (id,title,summary,subject_code,kind,status,manuscript_markdown,object_key,fingerprint)
        values ('30000000-0000-4000-8000-000000000013','虚构手稿','','302','manuscript','pending','虚构手稿正文','fictional/user-content/manuscript.mp4',repeat('a',64))`),
    ).toThrow()
    expect(() =>
      sql(`insert into submissions (id,title,summary,subject_code,kind,manuscript_markdown,fingerprint)
        values ('30000000-0000-4000-8000-000000000014','虚构手稿','','302','manuscript','虚构手稿正文',repeat('a',64))`),
    ).toThrow()
    expect(() =>
      sql(`insert into submissions (id,title,summary,subject_code,kind,status,fingerprint)
        values ('30000000-0000-4000-8000-000000000015','虚构手稿','','302','manuscript','pending',repeat('a',64))`),
    ).toThrow()
  })

  it("submission_subtitles 限制语言、格式、大小与字节数一致性并级联删除", () => {
    sql(`insert into submission_subtitles (submission_id,language,label,source_format,vtt_content,bytes)
      values ('${videoId}','zh','中文（简体）','srt','WEBVTT'||chr(10)||chr(10),octet_length('WEBVTT'||chr(10)||chr(10)))`)
    expect(() =>
      sql(`insert into submission_subtitles (submission_id,language,label,source_format,vtt_content,bytes)
        values ('${videoId}','zh','重复语言','vtt','WEBVTT',6)`),
    ).toThrow()
    expect(() =>
      sql(`insert into submission_subtitles (submission_id,language,label,source_format,vtt_content,bytes)
        values ('${videoId}','en','超长字幕','vtt',repeat('x',262145),262145)`),
    ).toThrow()
    expect(() =>
      sql(`insert into submission_subtitles (submission_id,language,label,source_format,vtt_content,bytes)
        values ('${videoId}','ZH','语言非法','vtt','WEBVTT',6)`),
    ).toThrow()
    expect(() =>
      sql(`insert into submission_subtitles (submission_id,language,label,source_format,vtt_content,bytes)
        values ('${videoId}','ja','格式非法','ass','WEBVTT',6)`),
    ).toThrow()
    expect(() =>
      sql(`insert into submission_subtitles (submission_id,language,label,source_format,vtt_content,bytes)
        values ('${videoId}','ko','   ','vtt','WEBVTT',6)`),
    ).toThrow()
    expect(() =>
      sql(`insert into submission_subtitles (submission_id,language,label,source_format,vtt_content,bytes)
        values ('${videoId}','fr','字节数不一致','vtt','WEBVTT',5)`),
    ).toThrow()
    sql(`delete from submissions where id='${videoId}'`)
    expect(sql(`select count(*) from submission_subtitles`)).toBe("0")
  })

  it("papers 按来源与审核状态收紧约束，未审核不能上架", () => {
    sql(`insert into accounts (id,name,email,role)
      values ('${accountId}','虚构审核员','fictional-reviewer@phone.invalid','admin')`)
    sql(`insert into papers (subject_code,year,slug,title,position)
      values ('302',2024,'fictional-admin-paper','虚构真题试卷',1)`)
    expect(sql(`select origin||'|'||review_status from papers where slug='fictional-admin-paper'`)).toBe(
      "admin|approved",
    )
    sql(`insert into papers (id,subject_code,year,slug,title,position,origin,review_status,rights_confirmed_at)
      values ('${pendingPaperId}','408',2024,'u-fictional-pending','虚构待审用户试卷',0,'user','pending',now())`)
    sql(`insert into papers (id,subject_code,year,slug,title,position,origin,review_status,rights_confirmed_at)
      values ('${approvedPaperId}','408',2023,'u-fictional-approved','虚构已通过用户试卷',0,'user','pending',now())`)

    expect(() => sql(`update papers set listed=true where id='${pendingPaperId}'`)).toThrow()
    expect(() =>
      sql(`insert into papers (subject_code,year,slug,title,position,origin)
        values ('302',2024,'fictional-imported','虚构非法来源试卷',1,'imported')`),
    ).toThrow()
    expect(() =>
      sql(`insert into papers (subject_code,year,slug,title,position,origin,review_status)
        values ('302',2024,'fictional-no-rights','虚构缺权利声明',1,'user','pending')`),
    ).toThrow()
    expect(() =>
      sql(`insert into papers (subject_code,year,slug,title,position,origin,review_status)
        values ('302',2024,'fictional-admin-pending','虚构管理员待审',1,'admin','pending')`),
    ).toThrow()

    expect(() =>
      sql(
        `update papers set review_status='rejected',reviewed_at=now(),reviewer_id='${accountId}' where id='${pendingPaperId}'`,
      ),
    ).toThrow()
    sql(
      `update papers set review_status='rejected',reviewed_at=now(),reviewer_id='${accountId}',review_reason='虚构驳回原因' where id='${pendingPaperId}'`,
    )
    expect(() =>
      sql(
        `update papers set review_status='approved',reviewed_at=now(),reviewer_id='${accountId}',review_reason='多余原因' where id='${pendingPaperId}'`,
      ),
    ).toThrow()

    sql(
      `update papers set review_status='approved',reviewed_at=now(),reviewer_id='${accountId}' where id='${approvedPaperId}'`,
    )
    sql(`update papers set listed=true where id='${approvedPaperId}'`)
    expect(sql(`select review_status||'|'||listed::text from papers where id='${approvedPaperId}'`)).toBe(
      "approved|true",
    )
  })

  it("paper_comments 限定同一试卷、正文长度与删除审计，并随试卷级联删除", () => {
    const commentId = sql(
      `insert into paper_comments (paper_id,body) values ('${approvedPaperId}','虚构试卷评论') returning id`,
    )
    expect(() =>
      sql(`insert into paper_comments (paper_id,parent_id,body)
        values ('${pendingPaperId}','${commentId}','虚构跨试卷回复')`),
    ).toThrow()
    expect(() => sql(`insert into paper_comments (paper_id,body) values ('${approvedPaperId}','   ')`)).toThrow()
    expect(() => sql(`insert into paper_comment_deletions (comment_id,reason) values ('${commentId}','   ')`)).toThrow()
    sql(`insert into paper_comment_deletions (comment_id,reason) values ('${commentId}','虚构删除原因')`)
    expect(sql(`select count(*) from paper_comment_deletions`)).toBe("1")
    sql(`delete from papers where id='${approvedPaperId}'`)
    expect(sql(`select count(*) from paper_comments where paper_id='${approvedPaperId}'`)).toBe("0")
    expect(sql(`select count(*) from paper_comment_deletions where comment_id='${commentId}'`)).toBe("0")
  })
})
