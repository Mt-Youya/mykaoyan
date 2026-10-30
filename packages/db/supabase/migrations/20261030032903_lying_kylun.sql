CREATE TABLE "comment_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"actor_id" uuid,
	"reason" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_deletions_comment_id_unique" UNIQUE("comment_id"),
	CONSTRAINT "comment_deletions_reason" CHECK (length(btrim("comment_deletions"."reason")) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "comment_deletions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "comment_keywords" (
	"word" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment_keywords" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"account_id" uuid,
	"parent_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "comments_id_lesson_unique" UNIQUE("id","lesson_id"),
	CONSTRAINT "comments_not_self_parent" CHECK ("comments"."parent_id" is null or "comments"."parent_id" <> "comments"."id"),
	CONSTRAINT "comments_body_length" CHECK (length(btrim("comments"."body")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comment_deletions" ADD CONSTRAINT "comment_deletions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_deletions" ADD CONSTRAINT "comment_deletions_actor_id_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_lesson_fk" FOREIGN KEY ("parent_id","lesson_id") REFERENCES "public"."comments"("id","lesson_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_lesson_created_idx" ON "comments" USING btree ("lesson_id","created_at","id");
REVOKE ALL ON TABLE public.comments,public.comment_deletions,public.comment_keywords FROM PUBLIC,anon,authenticated;
