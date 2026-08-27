import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { guardrailAudit, guardrailSettings } from "@workspace/studio/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { DEFAULTS, isRelaxed } from "@/shared/guardrail-state";
import { requireOrgAdmin, resolveGuardrails } from "./guardrail-store";
import { requireBrand, requireSession } from "./guards";

/**
 * Guardrails are switches rather than product constants, which is a decision
 * that has to be paid for in bookkeeping: every change records who made it and
 * why, and the audit table is append-only. Without that, an incident becomes an
 * argument about what the settings were at the time.
 */

export const getGuardrails = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const brand = await requireBrand(session.user.id, data.brandId);
		const settings = await resolveGuardrails(brand.organizationId);
		const history = await db
			.select()
			.from(guardrailAudit)
			.where(eq(guardrailAudit.organizationId, brand.organizationId))
			.orderBy(desc(guardrailAudit.createdAt))
			.limit(20);
		return { settings, history, relaxed: isRelaxed(settings) };
	});

const fieldSchema = z.enum(["requireReview", "blockAdLawTerms", "factBinding", "enableTrafficClone"]);

export const updateGuardrail = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			field: fieldSchema,
			value: z.union([z.boolean(), z.enum(["strict", "warn", "off"])]),
			reason: z.string().min(1, "改动必须写明原因"),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireSession();
		const brand = await requireBrand(session.user.id, data.brandId);
		await requireOrgAdmin(session.user.id, brand.organizationId);

		const current = await resolveGuardrails(brand.organizationId);
		const from = String(current[data.field]);
		const to = String(data.value);
		if (from === to) return;

		await db
			.insert(guardrailSettings)
			.values({
				organizationId: brand.organizationId,
				...DEFAULTS,
				[data.field]: data.value,
				updatedBy: session.user.id,
			})
			.onConflictDoUpdate({
				target: guardrailSettings.organizationId,
				set: { [data.field]: data.value, updatedBy: session.user.id },
			});

		await db.insert(guardrailAudit).values({
			organizationId: brand.organizationId,
			field: data.field,
			fromValue: from,
			toValue: to,
			actorUserId: session.user.id,
			reason: data.reason,
		});
	});
