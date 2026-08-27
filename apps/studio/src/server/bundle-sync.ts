import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@workspace/lib/db/db";
import { factEntries } from "@workspace/studio/schema";
import { eq } from "drizzle-orm";
import { parseFactsFile } from "@/shared/okf";

/**
 * Core of the bundle → database fact sync (opengeo-spec BUNDLE.md, 单向环流).
 * Bundle wins on every field; db-only entries are reported, never deleted
 * (draft citations reference them with ON DELETE RESTRICT).
 *
 * Plain function on purpose: called by the syncFactsFromBundle server fn and
 * by scripts/sync-bundle.ts. Lives outside route-imported modules.
 */
export async function syncFactsCore(factBaseId: string, ownerUserId: string, bundleDir: string) {
	const factsDir = join(bundleDir, "facts");
	const incoming = readdirSync(factsDir)
		.filter((f) => f.endsWith(".md"))
		.flatMap((f) => parseFactsFile(readFileSync(join(factsDir, f), "utf8")));

	const existing = await db.select().from(factEntries).where(eq(factEntries.factBaseId, factBaseId));
	const byId = new Map(existing.map((e) => [e.id, e]));

	let inserted = 0;
	let updated = 0;
	let unchanged = 0;
	for (const e of incoming) {
		const validUntil = e.validUntil ? new Date(e.validUntil) : null;
		const cur = byId.get(e.id);
		if (!cur) {
			await db.insert(factEntries).values({
				id: e.id,
				factBaseId,
				field: e.field,
				content: e.content,
				evidenceUrl: e.evidenceUrl,
				validUntil,
				approved: e.approved,
				ownerUserId,
			});
			inserted++;
			continue;
		}
		const same =
			cur.field === e.field &&
			cur.content === e.content &&
			(cur.evidenceUrl ?? null) === e.evidenceUrl &&
			(cur.validUntil?.getTime() ?? null) === (validUntil?.getTime() ?? null) &&
			cur.approved === e.approved;
		if (same) {
			unchanged++;
			continue;
		}
		await db
			.update(factEntries)
			.set({ field: e.field, content: e.content, evidenceUrl: e.evidenceUrl, validUntil, approved: e.approved })
			.where(eq(factEntries.id, e.id));
		updated++;
	}

	const incomingIds = new Set(incoming.map((e) => e.id));
	const dbOnly = existing.filter((e) => !incomingIds.has(e.id)).map((e) => e.id);
	return { inserted, updated, unchanged, dbOnly };
}
