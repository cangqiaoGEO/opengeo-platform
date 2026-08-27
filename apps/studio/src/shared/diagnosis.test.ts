import { describe, expect, it } from "vitest";
import { diagnose } from "./diagnosis";

const base = {
	runsTotal: 270,
	brandMentionedRuns: 40,
	sov: 0.32,
	promptsTotal: 30,
	promptsCovered: 12,
	citationsTotal: 808,
	brandCitations: 43,
	citationDomains: 25,
	warnFacts: 8,
	site: { reachable: true, robotsOk: true, sitemap: true, llms: false },
};

describe("diagnose", () => {
	it("weights six dimensions per the charter and grades the composite", () => {
		const d = diagnose(base);
		expect(d.dimensions.map((x) => x.weight)).toEqual([30, 20, 15, 15, 10, 10]);
		const manual = d.dimensions.reduce((s, x) => s + (x.score * x.weight) / 100, 0);
		expect(d.composite).toBeCloseTo(Math.round(manual * 10) / 10, 5);
		expect(["A", "B", "C", "D"]).toContain(d.grade);
	});

	it("is deterministic: same input, same score (charter regression rule)", () => {
		expect(diagnose(base)).toEqual(diagnose(base));
	});

	it("caps the warn-fact deduction and flags it as P0", () => {
		const d = diagnose({ ...base, warnFacts: 20 });
		const sentiment = d.dimensions.find((x) => x.key === "sentiment");
		expect(sentiment?.score).toBe(30); // 100 - cap 70
		expect(d.actions.some((a) => a.priority === "P0" && a.text.includes("错误归因"))).toBe(true);
	});

	it("handles a null SoV without dividing by zero", () => {
		const d = diagnose({ ...base, sov: null });
		expect(d.dimensions.find((x) => x.key === "recommendation")?.score).toBe(0);
	});

	it("a perfect input reaches grade A", () => {
		const d = diagnose({
			runsTotal: 100,
			brandMentionedRuns: 95,
			sov: 0.9,
			promptsTotal: 30,
			promptsCovered: 29,
			citationsTotal: 100,
			brandCitations: 80,
			citationDomains: 12,
			warnFacts: 0,
			site: { reachable: true, robotsOk: true, sitemap: true, llms: true },
		});
		expect(d.grade).toBe("A");
	});

	it("orders actions P0 before P1 before P2", () => {
		const d = diagnose(base);
		const ps = d.actions.map((a) => a.priority);
		expect(ps).toEqual([...ps].sort((a, b) => ({ P0: 0, P1: 1, P2: 2 })[a] - ({ P0: 0, P1: 1, P2: 2 })[b]));
	});
});
