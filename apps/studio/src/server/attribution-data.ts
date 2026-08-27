import { db } from "@workspace/lib/db/db";
import { citations, promptRuns } from "@workspace/lib/db/schema";
import { contentDrafts, publishRecords } from "@workspace/studio/schema";
import { asc, eq } from "drizzle-orm";
import { type AttributionVerdict, attributeRecord } from "@/shared/attribution";

/**
 * Load a brand's publish records and settle each one against the citation
 * pool (M2 归因闭环). Plain module — used by the attribution server fn and
 * scripts/attribution-report.ts; not imported by any route.
 */
export async function computeAttribution(brandId: string): Promise<{
	verdicts: AttributionVerdict[];
	runsTotal: number;
}> {
	const records = await db
		.select({
			id: publishRecords.id,
			url: publishRecords.url,
			channel: publishRecords.channel,
			publishedAt: publishRecords.publishedAt,
			draftTitle: contentDrafts.title,
		})
		.from(publishRecords)
		.innerJoin(contentDrafts, eq(publishRecords.draftId, contentDrafts.id))
		.where(eq(publishRecords.brandId, brandId))
		.orderBy(asc(publishRecords.publishedAt));

	const cits = await db
		.select({ url: citations.url, model: citations.model, createdAt: citations.createdAt })
		.from(citations)
		.where(eq(citations.brandId, brandId));

	const runs = await db
		.select({ createdAt: promptRuns.createdAt })
		.from(promptRuns)
		.where(eq(promptRuns.brandId, brandId));

	const verdicts = records.map((r) =>
		attributeRecord(r, cits, runs.filter((x) => x.createdAt >= r.publishedAt).length),
	);
	return { verdicts, runsTotal: runs.length };
}
