CREATE TYPE "public"."studio_publish_channel" AS ENUM('export', 'website', 'wechat_draft');--> statement-breakpoint
CREATE TABLE "studio_publish_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"brand_id" text NOT NULL,
	"channel" "studio_publish_channel" NOT NULL,
	"url" text,
	"note" text,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_publish_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"channel" "studio_publish_channel" NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_publish_records" ADD CONSTRAINT "studio_publish_records_draft_id_studio_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."studio_content_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_publish_records_brand_idx" ON "studio_publish_records" USING btree ("brand_id","published_at");--> statement-breakpoint
CREATE INDEX "studio_publish_records_draft_idx" ON "studio_publish_records" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "studio_publish_targets_brand_idx" ON "studio_publish_targets" USING btree ("brand_id","channel");