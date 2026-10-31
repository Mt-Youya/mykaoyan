CREATE TABLE "submission_subtitles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"language" text NOT NULL,
	"label" text NOT NULL,
	"source_format" text NOT NULL,
	"vtt_content" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_subtitles_submission_language_unique" UNIQUE("submission_id","language"),
	CONSTRAINT "submission_subtitles_language" CHECK ("submission_subtitles"."language" ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
	CONSTRAINT "submission_subtitles_label" CHECK (length(btrim("submission_subtitles"."label")) between 1 and 50),
	CONSTRAINT "submission_subtitles_source_format" CHECK ("submission_subtitles"."source_format" in ('srt','vtt')),
	CONSTRAINT "submission_subtitles_bytes" CHECK ("submission_subtitles"."bytes" between 1 and 262144 and "submission_subtitles"."bytes"=octet_length("submission_subtitles"."vtt_content"))
);
--> statement-breakpoint
ALTER TABLE "submission_subtitles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "paper_comment_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"actor_id" uuid,
	"reason" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_comment_deletions_comment_id_unique" UNIQUE("comment_id"),
	CONSTRAINT "paper_comment_deletions_reason" CHECK (length(btrim("paper_comment_deletions"."reason")) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "paper_comment_deletions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "paper_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_id" uuid NOT NULL,
	"account_id" uuid,
	"parent_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "paper_comments_id_paper_unique" UNIQUE("id","paper_id"),
	CONSTRAINT "paper_comments_not_self_parent" CHECK ("paper_comments"."parent_id" is null or "paper_comments"."parent_id" <> "paper_comments"."id"),
	CONSTRAINT "paper_comments_body_length" CHECK (length(btrim("paper_comments"."body")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "paper_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_limits";--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "duration" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "object_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "kind" text DEFAULT 'video' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "manuscript_markdown" text;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "origin" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "review_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "reviewer_id" uuid;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "rights_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submission_subtitles" ADD CONSTRAINT "submission_subtitles_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_comment_deletions" ADD CONSTRAINT "paper_comment_deletions_comment_id_paper_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."paper_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_comment_deletions" ADD CONSTRAINT "paper_comment_deletions_actor_id_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_comments" ADD CONSTRAINT "paper_comments_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_comments" ADD CONSTRAINT "paper_comments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_comments" ADD CONSTRAINT "paper_comments_parent_paper_fk" FOREIGN KEY ("parent_id","paper_id") REFERENCES "public"."paper_comments"("id","paper_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paper_comments_paper_created_idx" ON "paper_comments" USING btree ("paper_id","created_at","id");--> statement-breakpoint
ALTER TABLE "papers" ADD CONSTRAINT "papers_reviewer_id_accounts_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_subject_kind_status_listed_created_idx" ON "submissions" USING btree ("subject_code","kind","status","listed","created_at");--> statement-breakpoint
CREATE INDEX "papers_origin_review_subject_year_position_idx" ON "papers" USING btree ("origin","review_status","subject_code","year","position");--> statement-breakpoint
CREATE INDEX "papers_owner_created_idx" ON "papers" USING btree ("owner_account_id","created_at");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_kind" CHECK ("submissions"."kind" in ('video','manuscript'));--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_kind_limits" CHECK (("submissions"."kind"='video' and "submissions"."size" is not null and "submissions"."size">0 and "submissions"."size"<=500000000 and "submissions"."duration" is not null and "submissions"."duration">0 and "submissions"."duration"<=1800 and "submissions"."object_key" is not null and "submissions"."manuscript_markdown" is null) or ("submissions"."kind"='manuscript' and "submissions"."size" is null and "submissions"."duration" is null and "submissions"."object_key" is null and "submissions"."upload_id" is null and "submissions"."status"<>'uploading' and (("submissions"."manuscript_markdown" is not null and length("submissions"."manuscript_markdown") between 1 and 1000000 and octet_length("submissions"."manuscript_markdown") between 1 and 1048576) or "submissions"."deleted_at" is not null)));--> statement-breakpoint
ALTER TABLE "papers" ADD CONSTRAINT "papers_origin" CHECK ("papers"."origin" in ('admin','user'));--> statement-breakpoint
ALTER TABLE "papers" ADD CONSTRAINT "papers_review_status" CHECK ("papers"."review_status" in ('pending','approved','rejected'));--> statement-breakpoint
ALTER TABLE "papers" ADD CONSTRAINT "papers_review" CHECK (("papers"."origin"='admin' and "papers"."review_status"='approved') or ("papers"."origin"='user' and "papers"."rights_confirmed_at" is not null and (("papers"."review_status"='pending' and "papers"."reviewed_at" is null and "papers"."reviewer_id" is null) or ("papers"."review_status"='approved' and "papers"."reviewed_at" is not null and "papers"."reviewer_id" is not null) or ("papers"."review_status"='rejected' and "papers"."reviewed_at" is not null and "papers"."reviewer_id" is not null and "papers"."review_reason" is not null and length(btrim("papers"."review_reason")) between 1 and 500))));--> statement-breakpoint
ALTER TABLE "papers" ADD CONSTRAINT "papers_review_reason" CHECK ("papers"."review_reason" is null or length(btrim("papers"."review_reason")) between 1 and 500);--> statement-breakpoint
ALTER TABLE "papers" ADD CONSTRAINT "papers_review_reason_absent" CHECK ("papers"."review_status"='rejected' or "papers"."review_reason" is null);--> statement-breakpoint
ALTER TABLE "papers" ADD CONSTRAINT "papers_listed" CHECK (not "papers"."listed" or "papers"."review_status"='approved');--> statement-breakpoint
REVOKE ALL ON TABLE public.submission_subtitles,public.paper_comments,public.paper_comment_deletions FROM PUBLIC,anon,authenticated;
