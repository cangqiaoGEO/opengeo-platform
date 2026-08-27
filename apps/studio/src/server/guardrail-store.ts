import { db } from "@workspace/lib/db/db";
import { member } from "@workspace/lib/db/schema";
import { guardrailSettings } from "@workspace/studio/schema";
import { and, eq } from "drizzle-orm";
import { DEFAULTS } from "@/shared/guardrail-state";

/** Server-only: never import from a route file. See the note in guards.ts. */

/** Absent settings mean nobody has relaxed anything, which is the safe reading. */
export async function resolveGuardrails(organizationId: string) {
	const [row] = await db.select().from(guardrailSettings).where(eq(guardrailSettings.organizationId, organizationId));
	return row ?? { organizationId, ...DEFAULTS, updatedBy: null, updatedAt: new Date() };
}

/** Only an owner or admin may relax a guardrail; members work under them. */
export async function requireOrgAdmin(userId: string, organizationId: string) {
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)));
	if (!row || !["owner", "admin"].includes(row.role)) {
		throw new Error("只有组织的 owner 或 admin 能改护栏设置");
	}
}
