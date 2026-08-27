CREATE TYPE "public"."studio_asset_kind" AS ENUM('image', 'video', 'text');--> statement-breakpoint
DROP INDEX "studio_assets_brand_idx";--> statement-breakpoint
ALTER TABLE "studio_assets" ALTER COLUMN "file_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_assets" ALTER COLUMN "mime_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_assets" ADD COLUMN "kind" "studio_asset_kind" DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_assets" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "studio_assets" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "studio_assets" ADD COLUMN "source_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_assets_brand_file_uidx" ON "studio_assets" USING btree ("brand_id","file_url");--> statement-breakpoint
CREATE INDEX "studio_assets_brand_idx" ON "studio_assets" USING btree ("brand_id","kind","category");