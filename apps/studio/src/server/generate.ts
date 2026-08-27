import { db } from "@workspace/lib/db/db";
import { getProvider } from "@workspace/lib/providers";
import { contentDrafts, draftFactCitations, factEntries } from "@workspace/studio/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

/**
 * Draft generation. Two decisions matter more than the prompt wording:
 *
 * Web search is off. The model writes from the fact base and nothing else —
 * the moment it may search, "the fact base is the only source" stops being
 * true and no amount of instruction text brings it back.
 *
 * Citations are ids, not prose. The model is handed the entries with their ids
 * and must name the id behind every factual claim, so binding is checked
 * against the table rather than trusted from a sentence that says "according to
 * our fact base".
 */

const draftSchema = z.object({
	title: z.string().describe("文章标题"),
	body: z.string().describe("正文全文，Markdown"),
	citations: z
		.array(
			z.object({
				claim: z.string().describe("正文里的一句具体断言，原文照抄"),
				factEntryId: z.string().describe("这条断言依据的事实条目 id，必须来自给定列表"),
			}),
		)
		.describe("每个涉及数字、认证、产能、交期的断言都要在这里出现"),
	unsupportedClaims: z
		.array(z.string())
		.describe("你认为这篇文章需要、但事实库里没有依据的说法。写在这里，不要写进正文。"),
});

/** Ad-law terms that make a claim unverifiable by construction. */
const AD_LAW_TERMS = ["最好", "最佳", "最优", "第一", "唯一", "国家级", "顶级", "世界领先", "100%", "永久"];

export type FactBinding = "strict" | "warn" | "off";

export async function generateDraft(args: {
	taskId: string;
	brandId: string;
	factBaseId: string;
	promptValue: string;
	articleInstruction: string;
	titleInstruction: string;
	factBinding: FactBinding;
	blockAdLawTerms: boolean;
}) {
	const entries = await db.select().from(factEntries).where(eq(factEntries.factBaseId, args.factBaseId));
	if (entries.length === 0) throw new Error("事实库还没有条目，先写事实再生成");

	const now = Date.now();
	const usable = entries.filter((e) => !e.validUntil || new Date(e.validUntil).getTime() > now);
	const expiredCount = entries.length - usable.length;

	const factList = usable
		.map((e) => `- id=${e.id} [${e.field}]${e.approved ? "" : "（未核准）"} ${e.content}`)
		.join("\n");

	const prompt = [
		args.articleInstruction,
		"",
		"标题指令：",
		args.titleInstruction,
		"",
		`读者会向 AI 提出的问题：${args.promptValue}`,
		"",
		"可引用的事实库条目（只有这些可以作为事实来源，id 要原样填进 citations）：",
		factList,
	].join("\n");

	const provider = getProvider("bailian");
	if (!provider.runStructuredResearch) throw new Error("bailian provider 不支持结构化生成");

	const result = await provider.runStructuredResearch({ prompt, schema: draftSchema, webSearch: false });
	const draft = result.object;

	// The model can name an id that does not exist; checking against the table is
	// the difference between a citation and a claim of one.
	const knownIds = new Set(usable.map((e) => e.id));
	const validCitations = draft.citations.filter((c) => knownIds.has(c.factEntryId));
	const invented = draft.citations.filter((c) => !knownIds.has(c.factEntryId)).map((c) => c.claim);
	const unsupported = [...draft.unsupportedClaims, ...invented];

	const flaggedTerms = AD_LAW_TERMS.filter((term) => draft.body.includes(term) || draft.title.includes(term));

	const blockedByFacts = args.factBinding === "strict" && unsupported.length > 0;
	const blockedByTerms = args.blockAdLawTerms && flaggedTerms.length > 0;

	const [row] = await db
		.insert(contentDrafts)
		.values({
			taskId: args.taskId,
			brandId: args.brandId,
			title: draft.title,
			body: draft.body,
			status: blockedByFacts || blockedByTerms ? "needs_facts" : "pending_review",
			unsupportedClaims: unsupported,
			flaggedTerms,
			modelVersion: result.modelVersion,
		})
		.returning();

	if (validCitations.length > 0) {
		await db
			.insert(draftFactCitations)
			.values(validCitations.map((c) => ({ draftId: row.id, factEntryId: c.factEntryId, claim: c.claim })));
	}

	return {
		draftId: row.id,
		title: draft.title,
		status: row.status,
		citations: validCitations.length,
		unsupported: unsupported.length,
		flaggedTerms,
		expiredEntriesSkipped: expiredCount,
	};
}

/** Exported for tests: the checks that decide whether a draft can go to review. */
export function classifyDraft(args: {
	unsupported: string[];
	flaggedTerms: string[];
	factBinding: FactBinding;
	blockAdLawTerms: boolean;
}): "needs_facts" | "pending_review" {
	const blockedByFacts = args.factBinding === "strict" && args.unsupported.length > 0;
	const blockedByTerms = args.blockAdLawTerms && args.flaggedTerms.length > 0;
	return blockedByFacts || blockedByTerms ? "needs_facts" : "pending_review";
}

export function findAdLawTerms(text: string): string[] {
	return AD_LAW_TERMS.filter((term) => text.includes(term));
}
