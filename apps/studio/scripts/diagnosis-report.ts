/**
 * Generate the six-dimension diagnosis and write it back to the bundle
 * (reports/diagnosis/, Attested Computation). Commits when the bundle is a repo.
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/diagnosis-report.ts <brandId> <bundleDir>
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderDiagnosisReport } from "../src/shared/diagnosis";
import { computeDiagnosis } from "../src/server/diagnosis-data";

async function main() {
	const [brandId, bundleDir] = process.argv.slice(2);
	if (!brandId || !bundleDir) throw new Error("用法：diagnosis-report.ts <brandId> <bundleDir>");

	const { brand, input, diagnosis } = await computeDiagnosis(brandId);
	const generatedAt = new Date().toISOString();
	const md = renderDiagnosisReport(diagnosis, { brandName: brand.name, generatedAt, runsTotal: input.runsTotal });

	const dir = join(bundleDir, "reports", "diagnosis");
	mkdirSync(dir, { recursive: true });
	const file = join(dir, `${generatedAt.slice(0, 10)}.md`);
	writeFileSync(file, md);
	console.log(`综合 ${diagnosis.composite} 分 · ${diagnosis.grade} 级 → ${file}`);

	if (existsSync(join(bundleDir, ".git"))) {
		execFileSync("git", ["-C", bundleDir, "add", "reports/diagnosis"]);
		const changed = execFileSync("git", ["-C", bundleDir, "status", "--porcelain"]).toString().trim();
		if (changed) {
			execFileSync("git", ["-C", bundleDir, "commit", "-q", "-m", `diagnosis ${generatedAt.slice(0, 10)}`]);
			console.log("已提交到 bundle 仓库");
		}
	}
	process.exit(0);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
