import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { member } from "@workspace/lib/db/schema";
import { guardrailAudit, guardrailSettings } from "@workspace/studio/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrand, requireSession } from "./tenant";

/**
 * Guardrails are switches rather than product constants, which is a decision
 * that has to be paid for in bookkeeping: every change records who made it and
 * why, and the audit table is append-only. Without that, an incident becomes an
 * argument about what the settings were at the time.
 */

export const DEFAULTS = {
	requireReview: true,
	blockAdLawTerms: true,
	factBinding: "strict" as const,
	enableTrafficClone: false,
};

/** Absent settings mean nobody has relaxed anything, which is the safe reading. */
export async function resolveGuardrails(organizationId: string) {
	const [row] = await db.select().from(guardrailSettings).where(eq(guardrailSettings.organizationId, organizationId));
	return row ?? { organizationId, ...DEFAULTS, updatedBy: null, updatedAt: new Date() };
}

/** Only an owner or admin may relax a guardrail; members work under them. */
async function requireOrgAdmin(userId: string, organizationId: string) {
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)));
	if (!row || !["owner", "admin"].includes(row.role)) {
		throw new Error("只有组织的 owner 或 admin 能改护栏设置");
	}
}

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

export function isRelaxed(s: {
	requireReview: boolean;
	blockAdLawTerms: boolean;
	factBinding: string;
	enableTrafficClone: boolean;
}): string[] {
	const relaxed: string[] = [];
	if (!s.requireReview) relaxed.push("发布前不再强制人工审核");
	if (!s.blockAdLawTerms) relaxed.push("绝对化用语不再拦截");
	if (s.factBinding === "warn") relaxed.push("无据说法只提示不拦截");
	if (s.factBinding === "off") relaxed.push("事实绑定已关闭");
	if (s.enableTrafficClone) relaxed.push("流量复刻已开启");
	return relaxed;
}

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
