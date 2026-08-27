import { describe, expect, it } from "vitest";
import { classifyDraft, detectLanguage, findAdLawTerms, publishableImageUrl } from "./generate";

const CLEAN = { unsupported: [], flaggedTerms: [], factBinding: "strict" as const, blockAdLawTerms: true };

describe("draft gating", () => {
	it("sends a clean draft to review", () => {
		expect(classifyDraft(CLEAN)).toEqual({ status: "pending_review", reasons: [] });
	});

	it("holds a draft that asserts something the fact base cannot support", () => {
		expect(classifyDraft({ ...CLEAN, unsupported: ["月产能 8,000 套"] })).toEqual({
			status: "needs_facts",
			reasons: ["unsupported_claims"],
		});
	});

	it("lets the same draft through when the org has relaxed fact binding to warn", () => {
		expect(classifyDraft({ ...CLEAN, unsupported: ["月产能 8,000 套"], factBinding: "warn" }).status).toBe(
			"pending_review",
		);
	});

	it("holds a draft containing an absolute claim while the term block is on", () => {
		expect(classifyDraft({ ...CLEAN, flaggedTerms: ["第一"] })).toEqual({
			status: "needs_facts",
			reasons: ["ad_law_terms"],
		});
	});

	it("lets it through once the org turns the term block off", () => {
		expect(classifyDraft({ ...CLEAN, flaggedTerms: ["第一"], blockAdLawTerms: false }).status).toBe("pending_review");
	});

	it("reports every reason, so fixing one does not hide the next", () => {
		expect(
			classifyDraft({ ...CLEAN, unsupported: ["x"], flaggedTerms: ["唯一"], promptLanguage: "en", draftLanguage: "zh" })
				.reasons,
		).toEqual(["unsupported_claims", "ad_law_terms", "language_mismatch"]);
	});
});

describe("language gate", () => {
	it("holds a Chinese draft written for an English query", () => {
		expect(classifyDraft({ ...CLEAN, promptLanguage: "en", draftLanguage: "zh" })).toEqual({
			status: "needs_facts",
			reasons: ["language_mismatch"],
		});
	});

	it("stays shut even when the org has relaxed everything else", () => {
		// A draft in the wrong language cannot answer the question it was written
		// for, whatever the org's policy — so this one is not a guardrail.
		expect(
			classifyDraft({
				unsupported: ["x"],
				flaggedTerms: ["第一"],
				factBinding: "off",
				blockAdLawTerms: false,
				promptLanguage: "en",
				draftLanguage: "zh",
			}),
		).toEqual({ status: "needs_facts", reasons: ["language_mismatch"] });
	});

	it("passes a matched pair", () => {
		expect(classifyDraft({ ...CLEAN, promptLanguage: "en", draftLanguage: "en" }).status).toBe("pending_review");
	});
});

describe("language detection", () => {
	it("reads a plain English query as English", () => {
		expect(detectLanguage("power lift chair supplier for senior living facilities")).toBe("en");
	});

	it("reads Chinese copy as Chinese even when it carries Latin terms", () => {
		expect(detectLanguage("海绵密度分为 D25/D30/D35 三档，PandaSofa 按订单配置")).toBe("zh");
	});

	it("reads an English article that names a Chinese brand as English", () => {
		expect(detectLanguage("PandaSofa is a recliner manufacturer in Anji, Zhejiang, serving importers worldwide.")).toBe(
			"en",
		);
	});
});

describe("ad-law screening", () => {
	it("finds absolute claims anywhere in the text", () => {
		expect(findAdLawTerms("我们是行业第一的唯一供应商")).toEqual(expect.arrayContaining(["第一", "唯一"]));
	});

	it("passes ordinary copy", () => {
		expect(findAdLawTerms("月产能与交期按订单量浮动，具体以合同为准")).toEqual([]);
	});
});

describe("publishable image urls", () => {
	it("drops the resize pipeline so an article gets the original upload", () => {
		expect(
			publishableImageUrl("https://icdn.tradew.com/a.jpg?x-oss-process=image/resize,m_fill,h_80,w_120/quality,Q_90"),
		).toBe("https://icdn.tradew.com/a.jpg");
	});

	it("leaves a plain url alone", () => {
		expect(publishableImageUrl("https://icdn.tradew.com/a.jpg")).toBe("https://icdn.tradew.com/a.jpg");
	});

	it("keeps a query that is not an image pipeline", () => {
		expect(publishableImageUrl("https://cdn.example.com/a.jpg?v=3")).toBe("https://cdn.example.com/a.jpg?v=3");
	});
});
