CREATE TYPE "public"."studio_draft_status" AS ENUM('generating', 'needs_facts', 'pending_review', 'approved', 'rejected', 'published');--> statement-breakpoint
CREATE TYPE "public"."studio_template_kind" AS ENUM('title', 'article');--> statement-breakpoint
CREATE TABLE "studio_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"category" text NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"alt_text" text,
	"license_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_content_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"brand_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "studio_draft_status" DEFAULT 'generating' NOT NULL,
	"unsupported_claims" text[] DEFAULT '{}' NOT NULL,
	"flagged_terms" text[] DEFAULT '{}' NOT NULL,
	"model_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_content_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"prompt_ids" text[] DEFAULT '{}' NOT NULL,
	"draft_count" integer NOT NULL,
	"images_per_draft" integer DEFAULT 0 NOT NULL,
	"guardrails_snapshot" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_draft_fact_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"fact_entry_id" uuid NOT NULL,
	"claim" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_instruction_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"kind" "studio_template_kind" NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"channel" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_review_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_content_drafts" ADD CONSTRAINT "studio_content_drafts_task_id_studio_content_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."studio_content_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_draft_fact_citations" ADD CONSTRAINT "studio_draft_fact_citations_draft_id_studio_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."studio_content_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_draft_fact_citations" ADD CONSTRAINT "studio_draft_fact_citations_fact_entry_id_studio_fact_entries_id_fk" FOREIGN KEY ("fact_entry_id") REFERENCES "public"."studio_fact_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_review_actions" ADD CONSTRAINT "studio_review_actions_draft_id_studio_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."studio_content_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_assets_brand_idx" ON "studio_assets" USING btree ("brand_id","category");--> statement-breakpoint
CREATE INDEX "studio_content_drafts_task_idx" ON "studio_content_drafts" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "studio_content_drafts_brand_status_idx" ON "studio_content_drafts" USING btree ("brand_id","status");--> statement-breakpoint
CREATE INDEX "studio_content_tasks_brand_idx" ON "studio_content_tasks" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "studio_draft_fact_citations_draft_idx" ON "studio_draft_fact_citations" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "studio_instruction_templates_brand_kind_idx" ON "studio_instruction_templates" USING btree ("brand_id","kind","enabled");--> statement-breakpoint
CREATE INDEX "studio_review_actions_draft_idx" ON "studio_review_actions" USING btree ("draft_id","created_at");