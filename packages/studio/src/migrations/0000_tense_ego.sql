CREATE TYPE "public"."studio_fact_binding_mode" AS ENUM('strict', 'warn', 'off');--> statement-breakpoint
CREATE TYPE "public"."studio_fact_field" AS ENUM('product_service', 'product_feature', 'brand_story', 'user_pain', 'trust_credential', 'customer_case', 'capacity', 'certification', 'lead_time', 'pricing_basis', 'other');--> statement-breakpoint
CREATE TABLE "studio_fact_bases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"company_name" text NOT NULL,
	"short_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_fact_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fact_base_id" uuid NOT NULL,
	"field" "studio_fact_field" NOT NULL,
	"content" text NOT NULL,
	"evidence_url" text,
	"valid_until" timestamp with time zone,
	"owner_user_id" text,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_guardrail_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"field" text NOT NULL,
	"from_value" text NOT NULL,
	"to_value" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_guardrail_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"require_review" boolean DEFAULT true NOT NULL,
	"block_ad_law_terms" boolean DEFAULT true NOT NULL,
	"fact_binding" "studio_fact_binding_mode" DEFAULT 'strict' NOT NULL,
	"enable_traffic_clone" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_fact_entries" ADD CONSTRAINT "studio_fact_entries_fact_base_id_studio_fact_bases_id_fk" FOREIGN KEY ("fact_base_id") REFERENCES "public"."studio_fact_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_fact_bases_org_idx" ON "studio_fact_bases" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_fact_bases_brand_uidx" ON "studio_fact_bases" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "studio_fact_entries_base_idx" ON "studio_fact_entries" USING btree ("fact_base_id");--> statement-breakpoint
CREATE INDEX "studio_fact_entries_base_field_idx" ON "studio_fact_entries" USING btree ("fact_base_id","field");--> statement-breakpoint
CREATE INDEX "studio_guardrail_audit_org_idx" ON "studio_guardrail_audit" USING btree ("organization_id","created_at");