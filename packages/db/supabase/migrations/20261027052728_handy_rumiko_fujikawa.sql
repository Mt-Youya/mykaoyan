CREATE TABLE "listing_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"listed" boolean NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "listing_changes" ADD CONSTRAINT "listing_changes_actor_id_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_changes_target_idx" ON "listing_changes" USING btree ("target_type","target_id","created_at");
-- 上下架记录同样只经 API 服务层访问。
--> statement-breakpoint
REVOKE ALL ON TABLE public.listing_changes FROM PUBLIC, anon, authenticated;
