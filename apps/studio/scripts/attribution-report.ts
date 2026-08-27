/**
 * Settle every publish record against the citation pool and write the verdict
 * back to the bundle as markdown (Attested Computation, spec BUNDLE.md
 * reports/attribution/). Committed to git when the bundle is a repo.
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/attribution-report.ts <brandId> <bundleDir>
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@workspace/lib/db/db";
import { factBases } from "@workspace/studio/schema";
import { eq } from "drizzle-orm";
import { renderAttributionReport } from "../src/shared/attribution";
import { computeAttribution } from "../src/server/attribution-data";

async function main() {
	const [brandId, bundleDir] = process.argv.slice(2);
	if (!brandId || !bundleDir) throw new Error("用法：attribution-report.ts <brandId> <bundleDir>");

	const [base] = await db.select().from(factBases).where(eq(factBases.brandId, brandId));
	const { verdicts, runsTotal } = await computeAttribution(brandId);
	const generatedAt = new Date().toISOString();
	const md = renderAttributionReport(verdicts, {
		brandName: base?.shortName || base?.companyName || brandId,
		generatedAt,
		runsTotal,
	});

	const dir = join(bundleDir, "reports", "attribution");
	mkdirSync(dir, { recursive: true });
	const file = join(dir, `${generatedAt.slice(0, 10)}.md`);
	writeFileSync(file, md);
	console.log(`判决 ${verdicts.length} 条 → ${file}`);

	if (existsSync(join(bundleDir, ".git"))) {
		execFileSync("git", ["-C", bundleDir, "add", "reports/attribution"]);
		const changed = execFileSync("git", ["-C", bundleDir, "status", "--porcelain"]).toString().trim();
		if (changed) {
			execFileSync("git", ["-C", bundleDir, "commit", "-q", "-m", `attribution verdict ${generatedAt.slice(0, 10)}`]);
			console.log("已提交到 bundle 仓库");
		}
	}
	process.exit(0);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
