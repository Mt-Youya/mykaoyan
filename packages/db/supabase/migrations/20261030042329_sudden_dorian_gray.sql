CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"subject_code" text NOT NULL,
	"topic_id" text,
	"size" integer NOT NULL,
	"duration" double precision NOT NULL,
	"fingerprint" text NOT NULL,
	"object_key" text NOT NULL,
	"upload_id" text,
	"status" text DEFAULT 'uploading' NOT NULL,
	"listed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewer_id" uuid,
	"reason" text,
	"delete_marked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "submissions_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "submissions_state" CHECK ("submissions"."status" in ('uploading','pending','approved','rejected')),
	CONSTRAINT "submissions_visibility" CHECK (not "submissions"."listed" or ("submissions"."status"='approved' and "submissions"."deleted_at" is null and "submissions"."delete_marked_at" is null)),
	CONSTRAINT "submissions_limits" CHECK ("submissions"."size">0 and "submissions"."size"<=500000000 and "submissions"."duration">0 and "submissions"."duration"<=1800),
	CONSTRAINT "submissions_review" CHECK (("submissions"."status" in ('uploading','pending') and "submissions"."reviewed_at" is null) or ("submissions"."status" in ('approved','rejected') and "submissions"."reviewed_at" is not null and ("submissions"."status"<>'rejected' or length(trim("submissions"."reason")) between 1 and 500)))
);
--> statement-breakpoint
ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewer_id_accounts_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_account_created_idx" ON "submissions" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "submissions_subject_created_idx" ON "submissions" USING btree ("subject_code","created_at");--> statement-breakpoint
CREATE INDEX "submissions_status_reviewed_idx" ON "submissions" USING btree ("status","reviewed_at");
REVOKE ALL ON TABLE "submissions" FROM PUBLIC, anon, authenticated;
