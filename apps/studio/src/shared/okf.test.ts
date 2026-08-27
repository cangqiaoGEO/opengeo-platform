import { describe, expect, it } from "vitest";
import { type OkfEntry, parseFactsFile, serializeFacts } from "./okf";

const at = "2026-08-28T12:00:00+08:00";

const sample: OkfEntry[] = [
	{
		id: "11111111-2222-3333-4444-555555555555",
		field: "certification",
		content: "BSCI 验厂通过（2025）。\n\n证书编号 ABC-123，含多行内容与 - 列表：\n- 项目一\n- 项目二",
		evidenceUrl: "https://www.pandasofa.com/quality",
		validUntil: "2027-01-01T00:00:00.000Z",
		approved: true,
	},
	{
		id: "99999999-8888-7777-6666-555555555555",
		field: "certification",
		content: "⚠️ ChatGPT 归因了官网从未声明的 TÜV 认证——待客户确认。",
		evidenceUrl: null,
		validUntil: null,
		approved: false,
	},
];

describe("okf serialize/parse roundtrip", () => {
	it("round-trips entries exactly, ids included", () => {
		const files = serializeFacts(sample, { generatedAt: at, brandName: "PandaSofa" });
		const md = files.get("certification.md");
		expect(md).toBeTruthy();
		const back = parseFactsFile(md as string);
		expect(back).toEqual(sample);
	});

	it("writes an index linking each non-empty field file", () => {
		const files = serializeFacts(sample, { generatedAt: at, brandName: "PandaSofa" });
		expect(files.get("index.md")).toContain("(certification.md)");
		// empty fields produce no file and no index line
		expect(files.has("capacity.md")).toBe(false);
	});

	it("marks a file stable only when some entry is approved", () => {
		const files = serializeFacts(sample, { generatedAt: at, brandName: "PandaSofa" });
		expect(files.get("certification.md")).toContain("status: stable");
		const draftOnly = serializeFacts([{ ...sample[1] }], { generatedAt: at, brandName: "X" });
		expect(draftOnly.get("certification.md")).toContain("status: draft");
	});

	it("returns no entries for the index file", () => {
		const files = serializeFacts(sample, { generatedAt: at, brandName: "PandaSofa" });
		expect(parseFactsFile(files.get("index.md") as string)).toEqual([]);
	});
});
