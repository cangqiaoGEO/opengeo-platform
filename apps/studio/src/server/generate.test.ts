import { describe, expect, it } from "vitest";
import { classifyDraft, findAdLawTerms } from "./generate";

describe("draft gating", () => {
	it("sends a clean draft to review", () => {
		expect(
			classifyDraft({ unsupported: [], flaggedTerms: [], factBinding: "strict", blockAdLawTerms: true }),
		).toBe("pending_review");
	});

	it("holds a draft that asserts something the fact base cannot support", () => {
		expect(
			classifyDraft({
				unsupported: ["月产能 8,000 套"],
				flaggedTerms: [],
				factBinding: "strict",
				blockAdLawTerms: true,
			}),
		).toBe("needs_facts");
	});

	it("lets the same draft through when the org has relaxed fact binding to warn", () => {
		expect(
			classifyDraft({
				unsupported: ["月产能 8,000 套"],
				flaggedTerms: [],
				factBinding: "warn",
				blockAdLawTerms: true,
			}),
		).toBe("pending_review");
	});

	it("holds a draft containing an absolute claim while the term block is on", () => {
		expect(
			classifyDraft({ unsupported: [], flaggedTerms: ["第一"], factBinding: "strict", blockAdLawTerms: true }),
		).toBe("needs_facts");
	});

	it("lets it through once the org turns the term block off", () => {
		expect(
			classifyDraft({ unsupported: [], flaggedTerms: ["第一"], factBinding: "strict", blockAdLawTerms: false }),
		).toBe("pending_review");
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
