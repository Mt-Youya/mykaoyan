CREATE TABLE "lesson_publications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"document" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"base_hash" text,
	"old_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "publish_key" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "content_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD COLUMN "scope" text DEFAULT 'progress' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_publications" ADD CONSTRAINT "lesson_publications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_publish_key_unique" UNIQUE("publish_key");
REVOKE ALL ON TABLE public.lesson_publications FROM PUBLIC, anon, authenticated;
ALTER TABLE public.agent_tokens ADD CONSTRAINT agent_tokens_scope_check CHECK (scope in ('progress','publish'));
