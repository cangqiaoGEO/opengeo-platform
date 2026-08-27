/**
 * CLI counterpart of the facts-page sync button — pull the bundle's facts/
 * into the runtime copy. Used headless and in acceptance checks.
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/sync-bundle.ts <brandId> <bundleDir>
 */
import { db } from "@workspace/lib/db/db";
import { factBases } from "@workspace/studio/schema";
import { eq } from "drizzle-orm";
import { syncFactsCore } from "../src/server/bundle-sync";

async function main() {
	const [brandId, bundleDir] = process.argv.slice(2);
	if (!brandId || !bundleDir) throw new Error("用法：sync-bundle.ts <brandId> <bundleDir>");
	const [base] = await db.select().from(factBases).where(eq(factBases.brandId, brandId));
	if (!base) throw new Error("这个品牌还没有事实库");
	const r = await syncFactsCore(base.id, base.brandId, bundleDir);
	console.log(`新增 ${r.inserted} · 更新 ${r.updated} · 未变 ${r.unchanged} · 仅存在于数据库 ${r.dbOnly.length}`);
	process.exit(0);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
