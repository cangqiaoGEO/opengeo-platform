import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

/**
 * Studio's own tables, in the same database as the platform but with their own
 * migration numbering. Tenancy hangs off the platform's `organization` /
 * `brands` rows by id — a plain text column rather than a foreign key, because
 * a cross-package FK would force this schema into packages/lib's migration
 * chain and put us back in the upstream's way.
 */

/**
 * How hard the fact binding is enforced when a draft is generated.
 * `strict` blocks submission on an unsupported claim, `warn` flags it and lets
 * it through, `off` skips the check. Default strict: the whole point of the
 * fact base is that the model cannot invent capacity, certifications or cases.
 */
export const factBindingModeEnum = pgEnum("studio_fact_binding_mode", ["strict", "warn", "off"]);

/**
 * One fact base per brand. The field set is the WorkBuddy brand-fact template,
 * kept identical on purpose: a Studio fact base has to be exportable as the
 * folder a student builds by hand, and a hand-built one has to be importable.
 */
export const factBases = pgTable(
	"studio_fact_bases",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		brandId: text("brand_id").notNull(),
		name: text("name").notNull(),
		companyName: text("company_name").notNull(),
		shortName: text("short_name"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("studio_fact_bases_org_idx").on(table.organizationId),
		uniqueIndex("studio_fact_bases_brand_uidx").on(table.brandId),
	],
);

/**
 * Field names a fact entry can carry. These are the eleven the template
 * defines; content generation cites entries by id, so the vocabulary has to be
 * closed rather than free-text.
 */
export const factFieldEnum = pgEnum("studio_fact_field", [
	"product_service",
	"product_feature",
	"brand_story",
	"user_pain",
	"trust_credential",
	"customer_case",
	"capacity",
	"certification",
	"lead_time",
	"pricing_basis",
	"other",
]);

/**
 * One checkable claim. `evidenceUrl` and `validUntil` exist because a fact base
 * decays: a certification lapses and a capacity number goes stale, and a draft
 * citing an expired entry is exactly as wrong as an invented one.
 */
export const factEntries = pgTable(
	"studio_fact_entries",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		factBaseId: uuid("fact_base_id")
			.references(() => factBases.id, { onDelete: "cascade" })
			.notNull(),
		field: factFieldEnum("field").notNull(),
		content: text("content").notNull(),
		evidenceUrl: text("evidence_url"),
		validUntil: timestamp("valid_until", { withTimezone: true }),
		ownerUserId: text("owner_user_id"),
		approved: boolean("approved").default(false).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("studio_fact_entries_base_idx").on(table.factBaseId),
		index("studio_fact_entries_base_field_idx").on(table.factBaseId, table.field),
	],
);

/**
 * Guardrails are org-level switches rather than product constants (review
 * decision D4). Defaults are the safe values; turning one off is an owner-only
 * action that has to leave a row in `guardrailAudit`.
 */
export const guardrailSettings = pgTable("studio_guardrail_settings", {
	organizationId: text("organization_id").primaryKey().notNull(),
	requireReview: boolean("require_review").default(true).notNull(),
	blockAdLawTerms: boolean("block_ad_law_terms").default(true).notNull(),
	factBinding: factBindingModeEnum("fact_binding").default("strict").notNull(),
	enableTrafficClone: boolean("enable_traffic_clone").default(false).notNull(),
	updatedBy: text("updated_by"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

/**
 * Append-only. Every guardrail change records who made it and why, so a content
 * incident can be traced back to the setting that allowed it rather than argued
 * about. Never updated or deleted.
 */
export const guardrailAudit = pgTable(
	"studio_guardrail_audit",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		field: text("field").notNull(),
		fromValue: text("from_value").notNull(),
		toValue: text("to_value").notNull(),
		actorUserId: text("actor_user_id").notNull(),
		reason: text("reason").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("studio_guardrail_audit_org_idx").on(table.organizationId, table.createdAt)],
);

/** Settings a draft was produced under, frozen at generation time. */
export type GuardrailSnapshot = {
	requireReview: boolean;
	blockAdLawTerms: boolean;
	factBinding: "strict" | "warn" | "off";
	enableTrafficClone: boolean;
};

export const guardrailSnapshotColumn = jsonb("guardrails_snapshot").$type<GuardrailSnapshot>();

/**
 * Where a draft is in the pipeline. `needs_facts` is the state a draft lands in
 * when generation produced claims the fact base cannot support and the org runs
 * strict binding — it is not an error, it is work for a human.
 */
export const draftStatusEnum = pgEnum("studio_draft_status", [
	"generating",
	"needs_facts",
	"pending_review",
	"approved",
	"rejected",
	"published",
]);

/** What a template tells the model to write. Kept separate so a task can rotate
 *  title and body instructions independently — writing both with one template is
 *  how a batch ends up reading like one article repeated. */
export const templateKindEnum = pgEnum("studio_template_kind", ["title", "article"]);

export const assets = pgTable(
	"studio_assets",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		brandId: text("brand_id").notNull(),
		category: text("category").notNull(),
		fileUrl: text("file_url").notNull(),
		mimeType: text("mime_type").notNull(),
		/** Written into the published page, so it is content rather than metadata. */
		altText: text("alt_text"),
		/** Who may use this image and under what terms — the risk an export brand
		 *  actually carries when a factory photo turns out to be a supplier's. */
		licenseSource: text("license_source"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("studio_assets_brand_idx").on(table.brandId, table.category)],
);

export const instructionTemplates = pgTable(
	"studio_instruction_templates",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		brandId: text("brand_id").notNull(),
		kind: templateKindEnum("kind").notNull(),
		name: text("name").notNull(),
		body: text("body").notNull(),
		/** Free-text channel hint ("wechat", "official-site"): platforms reward
		 *  different shapes, and one template per channel is how that gets used. */
		channel: text("channel"),
		enabled: boolean("enabled").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("studio_instruction_templates_brand_kind_idx").on(table.brandId, table.kind, table.enabled)],
);

export const contentTasks = pgTable(
	"studio_content_tasks",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		brandId: text("brand_id").notNull(),
		name: text("name").notNull(),
		/** Prompt ids from the platform's own table — the topics this batch is
		 *  meant to make the brand answerable for. Ids rather than a join so the
		 *  two schemas stay independent. */
		promptIds: text("prompt_ids").array().notNull().default([]),
		draftCount: integer("draft_count").notNull(),
		imagesPerDraft: integer("images_per_draft").default(0).notNull(),
		guardrails: guardrailSnapshotColumn.notNull(),
		createdBy: text("created_by").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("studio_content_tasks_brand_idx").on(table.brandId, table.createdAt)],
);

export const contentDrafts = pgTable(
	"studio_content_drafts",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		taskId: uuid("task_id")
			.references(() => contentTasks.id, { onDelete: "cascade" })
			.notNull(),
		brandId: text("brand_id").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		status: draftStatusEnum("status").default("generating").notNull(),
		/** Claims the checker could not tie to a fact entry. Empty is the
		 *  publishable case; anything here is what a reviewer has to resolve. */
		unsupportedClaims: text("unsupported_claims").array().notNull().default([]),
		/** Ad-law terms found in the body, whether or not the org blocks on them. */
		flaggedTerms: text("flagged_terms").array().notNull().default([]),
		modelVersion: text("model_version"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("studio_content_drafts_task_idx").on(table.taskId),
		index("studio_content_drafts_brand_status_idx").on(table.brandId, table.status),
	],
);

/** Which fact entry each supported claim rests on. This is the table that makes
 *  "where did this sentence come from" answerable after the fact. */
export const draftFactCitations = pgTable(
	"studio_draft_fact_citations",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		draftId: uuid("draft_id")
			.references(() => contentDrafts.id, { onDelete: "cascade" })
			.notNull(),
		factEntryId: uuid("fact_entry_id")
			.references(() => factEntries.id, { onDelete: "restrict" })
			.notNull(),
		claim: text("claim").notNull(),
	},
	(table) => [index("studio_draft_fact_citations_draft_idx").on(table.draftId)],
);

export const reviewActions = pgTable(
	"studio_review_actions",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		draftId: uuid("draft_id")
			.references(() => contentDrafts.id, { onDelete: "cascade" })
			.notNull(),
		action: text("action").notNull(),
		note: text("note"),
		actorUserId: text("actor_user_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("studio_review_actions_draft_idx").on(table.draftId, table.createdAt)],
);
