CREATE TABLE "submission_comment_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"actor_id" uuid,
	"reason" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_comment_deletions_comment_id_unique" UNIQUE("comment_id"),
	CONSTRAINT "submission_comment_deletions_reason" CHECK (length(btrim("submission_comment_deletions"."reason")) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "submission_comment_deletions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "submission_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"account_id" uuid,
	"parent_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "submission_comments_id_submission_unique" UNIQUE("id","submission_id"),
	CONSTRAINT "submission_comments_not_self_parent" CHECK ("submission_comments"."parent_id" is null or "submission_comments"."parent_id" <> "submission_comments"."id"),
	CONSTRAINT "submission_comments_body_length" CHECK (length(btrim("submission_comments"."body")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "submission_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "submission_comment_deletions" ADD CONSTRAINT "submission_comment_deletions_comment_id_submission_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."submission_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_comment_deletions" ADD CONSTRAINT "submission_comment_deletions_actor_id_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_parent_submission_fk" FOREIGN KEY ("parent_id","submission_id") REFERENCES "public"."submission_comments"("id","submission_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_comments_submission_created_idx" ON "submission_comments" USING btree ("submission_id","created_at","id");--> statement-breakpoint
REVOKE ALL ON TABLE public.submission_comments,public.submission_comment_deletions FROM PUBLIC,anon,authenticated;