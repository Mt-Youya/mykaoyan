CREATE TABLE "progress_documents" (
  "account_id" uuid PRIMARY KEY NOT NULL,
  "document" jsonb NOT NULL,
  "revision" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "progress_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "progress_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "document" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "progress_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "progress_documents" ADD CONSTRAINT "progress_documents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_revisions" ADD CONSTRAINT "progress_revisions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "progress_documents_updated_idx" ON "progress_documents" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_revisions_account_revision_unique" ON "progress_revisions" USING btree ("account_id","revision");--> statement-breakpoint
CREATE INDEX "progress_revisions_account_created_idx" ON "progress_revisions" USING btree ("account_id","created_at");--> statement-breakpoint
REVOKE ALL ON TABLE public.progress_documents FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE public.progress_revisions FROM PUBLIC, anon, authenticated;
