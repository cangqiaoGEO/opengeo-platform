/**
 * One-time (and repeatable) export of a brand's fact library to its OKF bundle
 * (opengeo-spec BUNDLE.md). After the first export the bundle is the writable
 * source of truth and studio imports from it — see sync-bundle in facts.ts.
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/export-okf.ts <brandId> <bundleDir>
 * Writes <bundleDir>/facts/*.md (existing facts/ files are replaced).
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@workspace/lib/db/db";
import { factBases, factEntries } from "@workspace/studio/schema";
import { asc, eq } from "drizzle-orm";
import type { OkfEntry } from "../src/shared/okf";
import { serializeFacts } from "../src/shared/okf";

async function main() {
	const [brandId, bundleDir] = process.argv.slice(2);
	if (!brandId || !bundleDir) throw new Error("用法：export-okf.ts <brandId> <bundleDir>");

	const [base] = await db.select().from(factBases).where(eq(factBases.brandId, brandId));
	if (!base) throw new Error("这个品牌还没有事实库");
	const rows = await db
		.select()
		.from(factEntries)
		.where(eq(factEntries.factBaseId, base.id))
		.orderBy(asc(factEntries.field), asc(factEntries.createdAt));

	const entries: OkfEntry[] = rows.map((r) => ({
		id: r.id,
		field: r.field,
		content: r.content,
		evidenceUrl: r.evidenceUrl,
		validUntil: r.validUntil ? r.validUntil.toISOString() : null,
		approved: r.approved,
	}));

	const files = serializeFacts(entries, {
		generatedAt: new Date().toISOString(),
		brandName: base.shortName || base.companyName,
	});

	// T 型横向覆盖：identity 由事实库主表生成，faq/channels 留待人工补齐
	const generatedAt = new Date().toISOString();
	files.set(
		"identity.md",
		[
			"---",
			"type: Identity",
			"title: 品牌身份",
			`description: ${base.companyName} 的主体标识（由 studio 导出）`,
			"status: stable",
			`generated: { by: opengeo-studio/export-okf, at: "${generatedAt}" }`,
			`verified: { by: human/studio-review, at: "${generatedAt}" }`,
			"---",
			"",
			`- 企业全称: ${base.companyName}`,
			...(base.shortName ? [`- 品牌名: ${base.shortName}`] : []),
			"",
		].join("\n"),
	);

	const index = files.get("index.md");
	if (index) files.set("index.md", `${index}- [品牌身份](identity.md)\n`);

	const factsDir = join(bundleDir, "facts");
	mkdirSync(factsDir, { recursive: true });
	for (const f of readdirSync(factsDir)) if (f.endsWith(".md")) rmSync(join(factsDir, f));
	for (const [name, content] of files) writeFileSync(join(factsDir, name), content);

	console.log(`已导出 ${entries.length} 条事实 → ${factsDir}（${files.size} 个文件）`);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
