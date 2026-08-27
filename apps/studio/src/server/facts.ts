import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { factBases, factEntries } from "@workspace/studio/schema";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrand, requireSession } from "./tenant";

/**
 * The fact base is the only source a draft may assert from, so these handlers
 * are deliberately boring: no inference, no enrichment, no "helpful" defaults.
 * Everything here is something a person typed and can be held to.
 */

export const FACT_FIELDS = [
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
] as const;

const fieldSchema = z.enum(FACT_FIELDS);

export const getFactBase = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		await requireBrand(session.user.id, data.brandId);

		const [base] = await db.select().from(factBases).where(eq(factBases.brandId, data.brandId));
		if (!base) return null;

		const entries = await db
			.select()
			.from(factEntries)
			.where(eq(factEntries.factBaseId, base.id))
			.orderBy(asc(factEntries.field), asc(factEntries.createdAt));

		return { base, entries };
	});

export const createFactBase = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), companyName: z.string().min(1), shortName: z.string().optional() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const brand = await requireBrand(session.user.id, data.brandId);

		const [base] = await db
			.insert(factBases)
			.values({
				organizationId: brand.organizationId,
				brandId: brand.id,
				name: `${brand.name} 事实库`,
				companyName: data.companyName,
				shortName: data.shortName || null,
			})
			.returning();

		return base;
	});

/** Resolve a fact base the caller may write to, or throw. */
async function requireWritableBase(userId: string, factBaseId: string) {
	const [base] = await db.select().from(factBases).where(eq(factBases.id, factBaseId));
	if (!base) throw new Error("Fact base not found");
	await requireBrand(userId, base.brandId);
	return base;
}

export const createFactEntry = createServerFn({ method: "POST" })
	.validator(
		z.object({
			factBaseId: z.string().uuid(),
			field: fieldSchema,
			content: z.string().min(1),
			evidenceUrl: z.string().url().optional().or(z.literal("")),
			validUntil: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireSession();
		await requireWritableBase(session.user.id, data.factBaseId);

		const [entry] = await db
			.insert(factEntries)
			.values({
				factBaseId: data.factBaseId,
				field: data.field,
				content: data.content,
				evidenceUrl: data.evidenceUrl || null,
				validUntil: data.validUntil ? new Date(data.validUntil) : null,
				ownerUserId: session.user.id,
			})
			.returning();

		return entry;
	});

/**
 * Approval is a person vouching for a claim, so it is recorded as its own act
 * rather than folded into an edit — an entry that changed content since it was
 * approved is not an approved entry.
 */
export const setFactEntryApproval = createServerFn({ method: "POST" })
	.validator(z.object({ entryId: z.string().uuid(), approved: z.boolean() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const [entry] = await db.select().from(factEntries).where(eq(factEntries.id, data.entryId));
		if (!entry) throw new Error("Entry not found");
		await requireWritableBase(session.user.id, entry.factBaseId);

		await db.update(factEntries).set({ approved: data.approved }).where(eq(factEntries.id, data.entryId));
	});

export const updateFactEntry = createServerFn({ method: "POST" })
	.validator(
		z.object({
			entryId: z.string().uuid(),
			content: z.string().min(1),
			evidenceUrl: z.string().url().optional().or(z.literal("")),
			validUntil: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireSession();
		const [entry] = await db.select().from(factEntries).where(eq(factEntries.id, data.entryId));
		if (!entry) throw new Error("Entry not found");
		await requireWritableBase(session.user.id, entry.factBaseId);

		// Editing the claim retires the approval it carried: what someone signed
		// off on is no longer what the entry says.
		await db
			.update(factEntries)
			.set({
				content: data.content,
				evidenceUrl: data.evidenceUrl || null,
				validUntil: data.validUntil ? new Date(data.validUntil) : null,
				approved: entry.content === data.content ? entry.approved : false,
			})
			.where(eq(factEntries.id, data.entryId));
	});

export const deleteFactEntry = createServerFn({ method: "POST" })
	.validator(z.object({ entryId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const [entry] = await db.select().from(factEntries).where(eq(factEntries.id, data.entryId));
		if (!entry) return;
		await requireWritableBase(session.user.id, entry.factBaseId);

		await db.delete(factEntries).where(and(eq(factEntries.id, data.entryId)));
	});
