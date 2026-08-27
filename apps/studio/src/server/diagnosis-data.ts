import { db } from "@workspace/lib/db/db";
import { brands, citations, prompts as promptsTable, promptRuns } from "@workspace/lib/db/schema";
import { factEntries } from "@workspace/studio/schema";
import { eq, like, sql } from "drizzle-orm";
import { type DiagnosisInput, type SiteChecks, diagnose } from "@/shared/diagnosis";

/**
 * Measure the six-dimension aggregates for a brand (METRICS.md 诊断分).
 * Read-only over telemetry plus four live site checks — never touches the
 * collection pipeline. Plain module: used by scripts and (later) a server fn.
 */
export async function computeDiagnosis(brandId: string) {
	const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
	if (!brand) throw new Error("Brand not found");

	const [runAgg] = await db
		.select({
			total: sql<number>`count(*)::int`,
			mentioned: sql<number>`count(*) filter (where ${promptRuns.brandMentioned})::int`,
			competitorRuns: sql<number>`count(*) filter (where cardinality(${promptRuns.competitorsMentioned}) > 0)::int`,
			promptsCovered: sql<number>`count(distinct ${promptRuns.promptId}) filter (where ${promptRuns.brandMentioned})::int`,
		})
		.from(promptRuns)
		.where(eq(promptRuns.brandId, brandId));

	const [promptAgg] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(promptsTable)
		.where(eq(promptsTable.brandId, brandId));

	const brandHost = safeHost(brand.website);
	const [citAgg] = await db
		.select({
			total: sql<number>`count(*)::int`,
			own: sql<number>`count(*) filter (where ${citations.domain} ilike ${`%${brandHost}%`})::int`,
			domains: sql<number>`count(distinct ${citations.domain})::int`,
		})
		.from(citations)
		.where(eq(citations.brandId, brandId));

	const [warnAgg] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(factEntries)
		.where(like(factEntries.content, "%⚠️%"));

	const denom = runAgg.mentioned + runAgg.competitorRuns;
	const input: DiagnosisInput = {
		runsTotal: runAgg.total,
		brandMentionedRuns: runAgg.mentioned,
		sov: denom > 0 ? runAgg.mentioned / denom : null,
		promptsTotal: promptAgg.total,
		promptsCovered: runAgg.promptsCovered,
		citationsTotal: citAgg.total,
		brandCitations: citAgg.own,
		citationDomains: citAgg.domains,
		warnFacts: warnAgg.n,
		site: await checkSite(brand.website),
	};
	return { brand, input, diagnosis: diagnose(input) };
}

function safeHost(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

async function head(url: string): Promise<Response | null> {
	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 8000);
		const res = await fetch(url, { redirect: "follow", signal: ctrl.signal });
		clearTimeout(t);
		return res;
	} catch {
		return null;
	}
}

/** The automatable subset of the agentready checklist. */
export async function checkSite(website: string): Promise<SiteChecks> {
	const origin = (() => {
		try {
			return new URL(website).origin;
		} catch {
			return `https://${website}`;
		}
	})();
	const [home, robots, sitemap, llms] = await Promise.all([
		head(origin),
		head(`${origin}/robots.txt`),
		head(`${origin}/sitemap.xml`),
		head(`${origin}/llms.txt`),
	]);
	const robotsBody = robots?.ok ? await robots.text().catch(() => "") : "";
	const robotsBlocksAll = /user-agent:\s*\*\s*[\r\n]+\s*disallow:\s*\/\s*$/im.test(robotsBody);
	return {
		reachable: Boolean(home?.ok),
		robotsOk: Boolean(robots?.ok) && !robotsBlocksAll,
		sitemap: Boolean(sitemap?.ok),
		llms: Boolean(llms?.ok),
	};
}
