/**
 * Smoke test for draft generation: runs one draft against the live fact base
 * without going through the session-guarded server function.
 * Usage: pnpm exec tsx --env-file=.env scripts/smoke-generate.ts
 */
import { db } from "@workspace/lib/db/db";
import { contentTasks, factBases } from "@workspace/studio/schema";
import { DEFAULT_ARTICLE_INSTRUCTION, DEFAULT_TITLE_INSTRUCTION } from "../src/server/default-instructions";
import { generateDraft } from "../src/server/generate";

async function main() {
	const [fb] = await db.select().from(factBases);
	if (!fb) throw new Error("没有事实库，先在 /facts 建一个");

	const [task] = await db
		.insert(contentTasks)
		.values({
			organizationId: fb.organizationId,
			brandId: fb.brandId,
			name: "冒烟测试",
			promptIds: [],
			draftCount: 1,
			guardrails: { requireReview: true, blockAdLawTerms: true, factBinding: "strict", enableTrafficClone: false },
			createdBy: "smoke",
		})
		.returning();

	const result = await generateDraft({
		taskId: task.id,
		brandId: fb.brandId,
		factBaseId: fb.id,
		promptValue: process.argv[2] ?? "power lift chair supplier for senior living facilities",
		articleInstruction: DEFAULT_ARTICLE_INSTRUCTION,
		titleInstruction: DEFAULT_TITLE_INSTRUCTION,
		factBinding: "strict",
		blockAdLawTerms: true,
	});
	console.log(JSON.stringify(result, null, 2));
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FAILED:", e?.message ?? e);
		process.exit(1);
	});
