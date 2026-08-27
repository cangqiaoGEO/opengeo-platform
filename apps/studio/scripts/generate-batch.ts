/**
 * Run a batch of drafts from the command line, through the same rotation the
 * UI uses.
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/generate-batch.ts <brandId> <name> <count> [tag...]
 * Prompts are picked from the brand's tracked prompts, filtered by tag when
 * given, so a batch can target the gap the tracking side actually shows.
 */
import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import { contentTasks, factBases, guardrailSettings } from "@workspace/studio/schema";
import { eq } from "drizzle-orm";
import { runNextDraft } from "../src/server/task-runner";

async function main() {
	const [brandId, name, countArg, imagesArg, ...tags] = process.argv.slice(2);
	if (!brandId || !name || !countArg || imagesArg === undefined)
		throw new Error("用法：generate-batch.ts <brandId> <name> <count> <imagesPerDraft> [tag...]");
	const draftCount = Number(countArg);
	const imagesPerDraft = Number(imagesArg);

	const [factBase] = await db.select().from(factBases).where(eq(factBases.brandId, brandId));
	if (!factBase) throw new Error("这个品牌还没有事实库");

	const all = await db
		.select({ id: prompts.id, value: prompts.value, tags: prompts.tags })
		.from(prompts)
		.where(eq(prompts.brandId, brandId));
	const selected = tags.length ? all.filter((p) => p.tags.some((t) => tags.includes(t))) : all;
	if (selected.length === 0) throw new Error("没有符合标签的追踪问题");

	const [settings] = await db
		.select()
		.from(guardrailSettings)
		.where(eq(guardrailSettings.organizationId, factBase.organizationId));
	const guardrails = {
		requireReview: settings?.requireReview ?? true,
		blockAdLawTerms: settings?.blockAdLawTerms ?? true,
		factBinding: settings?.factBinding ?? ("strict" as const),
		enableTrafficClone: settings?.enableTrafficClone ?? false,
	};

	const [task] = await db
		.insert(contentTasks)
		.values({
			organizationId: factBase.organizationId,
			brandId,
			name,
			promptIds: selected.map((p) => p.id),
			draftCount,
			imagesPerDraft,
			guardrails,
			createdBy: "cli",
		})
		.returning();

	console.log(`任务「${name}」：${selected.length} 个问题，计划 ${draftCount} 篇\n`);

	for (let i = 0; i < draftCount; i++) {
		const started = Date.now();
		try {
			const r = await runNextDraft(task.id);
			if (!r) break;
			const seconds = ((Date.now() - started) / 1000).toFixed(0);
			console.log(
				`${String(i + 1).padStart(2)}. ${r.title}\n` +
					`    ${r.status === "pending_review" ? "待审核" : "待补事实"} · 引用 ${r.citations} 处 · 配图 ${r.images} 张 · 无据 ${r.unsupported} 条` +
					`${r.flaggedTerms.length ? ` · 敏感词 ${r.flaggedTerms.join("/")}` : ""} · ${seconds}s\n` +
					`    ${r.articleTemplate} × ${r.titleTemplate}\n    ← ${r.prompt}\n`,
			);
		} catch (e) {
			console.error(`${i + 1}. 失败：${e instanceof Error ? e.message : e}`);
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FAILED:", e?.message ?? e);
		process.exit(1);
	});
