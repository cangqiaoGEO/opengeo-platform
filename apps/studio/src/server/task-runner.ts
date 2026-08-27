import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import { assets, contentDrafts, contentTasks, factBases, instructionTemplates } from "@workspace/studio/schema";
import { and, count, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { generateDraft } from "./generate";

/**
 * The batch's rotation, kept out of the server function so a script can drive
 * the same code path the UI does. Two copies of "which prompt and which brief
 * comes next" would drift, and the drift would show up as a batch that reads
 * like one article repeated — the exact failure the rotation exists to prevent.
 */
export async function runNextDraft(taskId: string) {
	const [task] = await db.select().from(contentTasks).where(eq(contentTasks.id, taskId));
	if (!task) throw new Error("任务不存在");

	const [done] = await db.select({ value: count() }).from(contentDrafts).where(eq(contentDrafts.taskId, task.id));
	const made = done?.value ?? 0;
	if (made >= task.draftCount) return null;

	const [factBase] = await db.select().from(factBases).where(eq(factBases.brandId, task.brandId));
	if (!factBase) throw new Error("这个品牌还没有事实库");

	const templates = await db
		.select()
		.from(instructionTemplates)
		.where(and(eq(instructionTemplates.brandId, task.brandId), eq(instructionTemplates.enabled, true)));
	const articles = templates.filter((t) => t.kind === "article");
	const titles = templates.filter((t) => t.kind === "title");
	if (articles.length === 0 || titles.length === 0) throw new Error("需要至少一条文章指令和一条标题指令");

	const promptRows = await db
		.select({ id: prompts.id, value: prompts.value })
		.from(prompts)
		.where(inArray(prompts.id, task.promptIds));
	if (promptRows.length === 0) throw new Error("任务选中的问题已不存在");

	// Rotate prompts and briefs by index so a batch spreads across the selected
	// questions and the available angles instead of writing the first one N times.
	const promptRow = promptRows[made % promptRows.length];
	const article = articles[made % articles.length];
	const title = titles[made % titles.length];

	// Candidates are drawn wide and left to the model to choose from: it knows
	// which section it is about to write, and a keyword match on alt text picks
	// the same sofa photo for every article.
	const imageCandidates =
		task.imagesPerDraft > 0
			? await db
					.select({ id: assets.id, url: assets.fileUrl, alt: assets.altText, category: assets.category })
					.from(assets)
					.where(and(eq(assets.brandId, task.brandId), eq(assets.kind, "image"), isNotNull(assets.altText)))
					.orderBy(sql`random()`)
					.limit(24)
			: [];

	const result = await generateDraft({
		taskId: task.id,
		brandId: task.brandId,
		factBaseId: factBase.id,
		promptValue: promptRow.value,
		articleInstruction: article.body,
		titleInstruction: title.body,
		factBinding: task.guardrails.factBinding,
		blockAdLawTerms: task.guardrails.blockAdLawTerms,
		imageCandidates: imageCandidates.filter((c): c is typeof c & { url: string } => Boolean(c.url)),
		imageCount: task.imagesPerDraft,
	});

	return { ...result, prompt: promptRow.value, articleTemplate: article.name, titleTemplate: title.name };
}
