CREATE TABLE "paper_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"type" text NOT NULL,
	"score" integer,
	"topics" text[],
	"stem_markdown" text NOT NULL,
	"options" jsonb,
	"answer_markdown" text NOT NULL,
	"analysis_markdown" text
);
--> statement-breakpoint
ALTER TABLE "paper_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "papers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_code" text NOT NULL,
	"year" integer NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"source_note" text,
	"position" integer NOT NULL,
	"listed" boolean DEFAULT false NOT NULL,
	"content_hash" text,
	"content_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "papers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "papers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "paper_questions" ADD CONSTRAINT "paper_questions_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paper_questions_paper_number_unique" ON "paper_questions" USING btree ("paper_id","number");--> statement-breakpoint
CREATE INDEX "papers_subject_year_position_idx" ON "papers" USING btree ("subject_code","year","position");--> statement-breakpoint
REVOKE ALL ON TABLE public.papers FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE public.paper_questions FROM PUBLIC, anon, authenticated;
