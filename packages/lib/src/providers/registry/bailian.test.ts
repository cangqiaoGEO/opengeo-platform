import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { bailian } from "./bailian";

const ANSWER_PAYLOAD = {
	model: "qwen3.7-plus",
	choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "推荐芝华仕与顾家。" } }],
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
	vi.stubEnv("BAILIAN_API_KEY", "test-key");
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("bailian provider", () => {
	it("registers as a direct api provider requiring a version slug", () => {
		expect(bailian.access).toBe("api");
		expect(bailian.isConfigured()).toBe(true);
		expect(bailian.validateTarget?.({ model: "qwen", provider: "bailian", webSearch: true })).toMatch(/version slug/);
		expect(
			bailian.validateTarget?.({ model: "qwen", provider: "bailian", version: "qwen3.7-plus", webSearch: true }),
		).toBeNull();
	});

	it("turns thinking off and forces search when the target is :online", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(ANSWER_PAYLOAD));
		await bailian.run("qwen", "国内功能沙发厂家推荐？", { version: "qwen3.7-plus", webSearch: true });

		const [url, init] = fetchMock.mock.calls[0]!;
		expect(String(url)).toBe("https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions");
		const body = JSON.parse(String(init?.body));
		expect(body.model).toBe("qwen3.7-plus");
		expect(body.enable_thinking).toBe(false);
		expect(body.enable_search).toBe(true);
		expect(body.search_options).toMatchObject({ forced_search: true });
	});

	it("omits search parameters when the target is not :online", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(ANSWER_PAYLOAD));
		await bailian.run("qwen", "问题", { version: "qwen3.7-plus", webSearch: false });

		const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
		expect(body).not.toHaveProperty("enable_search");
	});

	it("reports no citations rather than inventing them when the surface returns none", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(ANSWER_PAYLOAD));
		const result = await bailian.run("qwen", "问题", { version: "qwen3.7-plus", webSearch: true });

		expect(result.textContent).toBe("推荐芝华仕与顾家。");
		expect(result.citations).toEqual([]);
		expect(result.webQueries).toEqual([]);
		expect(result.modelVersion).toBe("qwen3.7-plus");
	});

	it("reads citations if the surface ever starts returning search results", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({
				...ANSWER_PAYLOAD,
				search_info: {
					search_results: [
						{ url: "https://www.made-in-china.com/a", title: "目录站" },
						{ url: "https://www.made-in-china.com/a", title: "重复" },
						{ url: "not-a-url", title: "坏链接" },
					],
				},
			}),
		);
		const result = await bailian.run("qwen", "问题", { version: "qwen3.7-plus", webSearch: true });

		expect(result.citations).toEqual([
			{ url: "https://www.made-in-china.com/a", title: "目录站", domain: "made-in-china.com", citationIndex: 0 },
		]);
	});

	it("asks for a json schema and validates the reply against it", async () => {
		const schema = z.object({ brandName: z.string(), competitors: z.array(z.string()) });
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({
				model: "qwen3.7-plus",
				choices: [{ message: { content: '{"brandName":"PandaSofa","competitors":["Cheers"]}' } }],
			}),
		);

		const result = await bailian.runStructuredResearch!({ prompt: "分析 pandasofa.com", schema });

		const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
		expect(body.response_format.type).toBe("json_schema");
		expect(body.response_format.json_schema.schema.properties).toHaveProperty("brandName");
		expect(result.object).toEqual({ brandName: "PandaSofa", competitors: ["Cheers"] });
	});

	it("fails loudly on an HTTP error instead of storing an empty run", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: { code: "InvalidApiKey" } }, 401));
		await expect(bailian.run("qwen", "问题", { version: "qwen3.7-plus" })).rejects.toThrow(/401/);
	});

	it("honors a base URL override", async () => {
		vi.stubEnv("BAILIAN_BASE_URL", "https://example.test/v1/");
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(ANSWER_PAYLOAD));
		await bailian.run("qwen", "问题", { version: "qwen3.7-plus" });
		expect(String(fetchMock.mock.calls[0]![0])).toBe("https://example.test/v1/chat/completions");
	});
});
