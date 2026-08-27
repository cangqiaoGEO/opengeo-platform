import { describe, expect, it } from "vitest";
import { attributeRecord, normalizeUrl, renderAttributionReport } from "./attribution";

const pub = (over: object = {}) => ({
	id: "rec-1",
	url: "https://www.pandasofa.com/topic/sofa-oem/",
	channel: "website",
	publishedAt: new Date("2026-08-20T00:00:00Z"),
	draftTitle: "OEM 选型指南",
	...over,
});

describe("normalizeUrl", () => {
	it("treats protocol, www, query, hash and trailing slash as the same page", () => {
		const a = normalizeUrl("https://www.PandaSofa.com/topic/sofa-oem/?utm=x#s");
		expect(a).toBe("pandasofa.com/topic/sofa-oem");
		expect(normalizeUrl("http://pandasofa.com/topic/sofa-oem")).toBe(a);
	});
	it("keeps distinct paths distinct", () => {
		expect(normalizeUrl("pandasofa.com/a")).not.toBe(normalizeUrl("pandasofa.com/b"));
	});
});

describe("attributeRecord", () => {
	const cits = [
		{ url: "https://pandasofa.com/topic/sofa-oem", model: "chatgpt", createdAt: new Date("2026-08-27T10:00:00Z") },
		{ url: "https://www.pandasofa.com/topic/sofa-oem/", model: "bailian", createdAt: new Date("2026-08-27T12:00:00Z") },
		{ url: "https://pandasofa.com/other", model: "chatgpt", createdAt: new Date("2026-08-27T10:00:00Z") },
		{ url: "https://pandasofa.com/topic/sofa-oem", model: "chatgpt", createdAt: new Date("2026-08-01T00:00:00Z") },
	];

	it("counts only post-publish citations of the same page and collects models", () => {
		const v = attributeRecord(pub(), cits, 6);
		expect(v.verdict).toBe("cited");
		expect(v.citedAfter).toBe(2);
		expect(v.citedBefore).toBe(1);
		expect(v.models).toEqual(["bailian", "chatgpt"]);
		expect(v.firstCitedAt?.toISOString()).toBe("2026-08-27T10:00:00.000Z");
	});

	it("is not_cited when runs happened but nothing matched", () => {
		const v = attributeRecord(pub({ url: "https://pandasofa.com/brand-new-page" }), cits, 6);
		expect(v.verdict).toBe("not_cited");
		expect(v.citedAfter).toBe(0);
	});

	it("is no_runs_yet when no runs after publish", () => {
		expect(attributeRecord(pub(), cits, 0).verdict).toBe("no_runs_yet");
	});

	it("is no_url for offline channels", () => {
		expect(attributeRecord(pub({ url: null }), cits, 6).verdict).toBe("no_url");
	});
});

describe("renderAttributionReport", () => {
	it("emits frontmatter and one row per record", () => {
		const md = renderAttributionReport([attributeRecord(pub(), [], 3)], {
			brandName: "PandaSofa",
			generatedAt: "2026-08-28T12:00:00+08:00",
			runsTotal: 270,
		});
		expect(md).toContain("type: Report");
		expect(md).toContain("generated: { by: opengeo-platform/attribution");
		expect(md).toContain("| OEM 选型指南 |");
		expect(md).toContain("❌ 未被引");
	});
});
