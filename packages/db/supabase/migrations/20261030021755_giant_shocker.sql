CREATE TABLE "membership_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"reason" text,
	"actor_id" uuid,
	"code_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_periods_code_id_unique" UNIQUE("code_id"),
	CONSTRAINT "membership_periods_dates" CHECK ("membership_periods"."ends_at" > "membership_periods"."starts_at"),
	CONSTRAINT "membership_periods_source" CHECK ("membership_periods"."source" in ('manual','code')),
	CONSTRAINT "membership_periods_manual_reason" CHECK ("membership_periods"."source" <> 'manual' or length(btrim("membership_periods"."reason")) > 0 and "membership_periods"."reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "membership_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "redemption_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"last4" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_by" uuid,
	"redeemed_at" timestamp with time zone,
	CONSTRAINT "redemption_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "redemption_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_actor_id_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_code_id_redemption_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."redemption_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_redeemed_by_accounts_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_periods_account_end_idx" ON "membership_periods" USING btree ("account_id","ends_at");--> statement-breakpoint
CREATE INDEX "redemption_codes_created_idx" ON "redemption_codes" USING btree ("created_at","id");
REVOKE ALL ON TABLE public.redemption_codes,public.membership_periods FROM PUBLIC,anon,authenticated;
