import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
