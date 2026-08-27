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
	images: z
		.array(
			z.object({
				assetId: z.string().describe("素材库图片 id，必须来自给定候选列表"),
				afterHeading: z.string().describe("插在哪个小标题的这一段之后，写该小标题的原文"),
				caption: z.string().describe("图注，一句话说明这张图在讲什么"),
			}),
		)
		.describe("配图安排。只能从候选图片里选，选与该段内容真正相关的；宁可少放也不要硬凑。"),
});

/** Ad-law terms that make a claim unverifiable by construction. */
const AD_LAW_TERMS = ["最好", "最佳", "最优", "第一", "唯一", "国家级", "顶级", "世界领先", "100%", "永久"];

export type FactBinding = "strict" | "warn" | "off";

export type BlockReason = "unsupported_claims" | "ad_law_terms" | "language_mismatch";

const CJK = /[\u4e00-\u9fff]/;

/**
 * Which language a piece of text is written in, to the only resolution that
 * matters here: an article answering an English query has to be in English.
 * A Chinese article written for `power lift chair supplier for senior living
 * facilities` will never appear in that answer, however good it is.
 */
export function detectLanguage(text: string): "zh" | "en" {
	const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
	const latin = (text.match(/[A-Za-z]/g) ?? []).length;
	// Latin runs long in Chinese text too (brand names, units), so weight it:
	// a page is Chinese as soon as CJK carries a meaningful share of it.
	return cjk * 4 >= latin ? "zh" : "en";
}

export type ImageCandidate = { id: string; url: string; alt: string | null; category: string };

/**
 * The site serves most images through an OSS pipeline that resizes them for the
 * page they sit on — some as small as 120×80. Those URLs are what the importer
 * found, and they are useless in an article. Dropping the processing query
 * returns the original upload.
 */
export function publishableImageUrl(url: string): string {
	return url.includes("x-oss-process=") ? url.split("?")[0] : url;
}

export async function generateDraft(args: {
	taskId: string;
	brandId: string;
	factBaseId: string;
	promptValue: string;
	articleInstruction: string;
	titleInstruction: string;
	factBinding: FactBinding;
	blockAdLawTerms: boolean;
	imageCandidates?: ImageCandidate[];
	imageCount?: number;
}) {
	const entries = await db.select().from(factEntries).where(eq(factEntries.factBaseId, args.factBaseId));
	if (entries.length === 0) throw new Error("事实库还没有条目，先写事实再生成");

	const now = Date.now();
	const usable = entries.filter((e) => !e.validUntil || new Date(e.validUntil).getTime() > now);
	const expiredCount = entries.length - usable.length;

	const factList = usable
		.map((e) => `- id=${e.id} [${e.field}]${e.approved ? "" : "（未核准）"} ${e.content}`)
		.join("\n");

	const candidates = args.imageCandidates ?? [];
	const imageCount = Math.min(args.imageCount ?? 0, candidates.length);
	const imageBlock =
		imageCount > 0
			? [
					"",
					`配图：请从下面的候选图片里挑 ${imageCount} 张，放在内容真正对应的小标题之后。id 原样填进 images.assetId，不要自己写图片地址。`,
					...candidates.map((c) => `- id=${c.id} [${c.category}] ${c.alt ?? "（无描述）"}`),
				]
			: ["", "本篇不配图，images 返回空数组。"];

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
		...imageBlock,
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

	// Images go in by id for the same reason facts do: a URL the model wrote is a
	// URL nobody can vouch for. Two things follow from that.
	const byId = new Map(candidates.map((c) => [c.id, c]));
	const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

	// First: the model writes its own image markdown whatever the brief says, and
	// puts the asset id where the URL goes. Where that id is a real candidate the
	// placement it chose is worth keeping, so resolve it; every other image
	// markdown it wrote is dropped, because an address we cannot trace is one we
	// cannot publish.
	let placed = 0;
	let body = draft.body.replace(
		new RegExp(`!\\[([^\\]]*)\\]\\([^)]*?(${uuid})[^)]*\\)`, "g"),
		(_match, alt: string, id: string) => {
			const asset = byId.get(id);
			if (!asset || placed >= imageCount) return "";
			placed++;
			return `![${asset.alt ?? alt}](${publishableImageUrl(asset.url)})`;
		},
	);
	body = body.replace(/!\[[^\]]*\]\([^)]*\)/g, (match) => (match.includes("http") ? match : ""));
	// Removing an image from inside emphasis leaves the markers behind, and a
	// stray ** renders as literal asterisks in the reading view.
	body = body
		.replace(/\*\*\s*\*\*/g, "")
		.replace(/(^|\n)\s*\*\*\s*(\n|$)/g, "$1$2")
		.replace(/\n{3,}/g, "\n\n");

	// Second: whatever it asked for in the structured field, placed after the
	// section it named rather than wherever the prose happened to mention it.
	for (const image of draft.images ?? []) {
		const asset = byId.get(image.assetId);
		const url = asset ? publishableImageUrl(asset.url) : "";
		if (!asset || placed >= imageCount || body.includes(url)) continue;
		const markdown = `\n\n![${asset.alt ?? image.caption}](${url})\n\n*${image.caption}*\n`;
		const anchor = body.indexOf(image.afterHeading);
		if (anchor === -1) {
			body += markdown;
		} else {
			// After the paragraph that follows the heading, not immediately under it.
			const nextBreak = body.indexOf("\n\n", anchor + image.afterHeading.length);
			const at = nextBreak === -1 ? body.length : nextBreak;
			body = body.slice(0, at) + markdown + body.slice(at);
		}
		placed++;
	}

	const flaggedTerms = AD_LAW_TERMS.filter((term) => body.includes(term) || draft.title.includes(term));

	const promptLanguage = detectLanguage(args.promptValue);
	const draftLanguage = detectLanguage(`${draft.title}\n${draft.body}`);
	const verdict = classifyDraft({
		unsupported,
		flaggedTerms,
		factBinding: args.factBinding,
		blockAdLawTerms: args.blockAdLawTerms,
		promptLanguage,
		draftLanguage,
	});

	const [row] = await db
		.insert(contentDrafts)
		.values({
			taskId: args.taskId,
			brandId: args.brandId,
			title: draft.title,
			body,
			status: verdict.status,
			unsupportedClaims: unsupported,
			flaggedTerms,
			blockReasons: verdict.reasons,
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
		blockReasons: verdict.reasons,
		citations: validCitations.length,
		images: placed,
		unsupported: unsupported.length,
		flaggedTerms,
		promptLanguage,
		draftLanguage,
		expiredEntriesSkipped: expiredCount,
	};
}

/** Exported for tests: the checks that decide whether a draft can go to review. */
export function classifyDraft(args: {
	unsupported: string[];
	flaggedTerms: string[];
	factBinding: FactBinding;
	blockAdLawTerms: boolean;
	promptLanguage?: "zh" | "en";
	draftLanguage?: "zh" | "en";
}): { status: "needs_facts" | "pending_review"; reasons: BlockReason[] } {
	const reasons: BlockReason[] = [];
	if (args.factBinding === "strict" && args.unsupported.length > 0) reasons.push("unsupported_claims");
	if (args.blockAdLawTerms && args.flaggedTerms.length > 0) reasons.push("ad_law_terms");
	// Language is not a guardrail anyone turns off: a draft in the wrong language
	// cannot answer the question it was written for, whatever the org's policy.
	if (args.promptLanguage && args.draftLanguage && args.promptLanguage !== args.draftLanguage) {
		reasons.push("language_mismatch");
	}
	return { status: reasons.length > 0 ? "needs_facts" : "pending_review", reasons };
}

export function findAdLawTerms(text: string): string[] {
	return AD_LAW_TERMS.filter((term) => text.includes(term));
}
