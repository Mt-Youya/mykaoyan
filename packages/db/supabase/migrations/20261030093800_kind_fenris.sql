CREATE TABLE "submission_ratings" (
	"submission_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"stars" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_ratings_submission_id_account_id_pk" PRIMARY KEY("submission_id","account_id"),
	CONSTRAINT "submission_ratings_stars" CHECK ("submission_ratings"."stars" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "submission_ratings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "submission_ratings" ADD CONSTRAINT "submission_ratings_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_ratings" ADD CONSTRAINT "submission_ratings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_ratings_account_idx" ON "submission_ratings" USING btree ("account_id");
REVOKE ALL ON TABLE "submission_ratings" FROM PUBLIC, anon, authenticated;
