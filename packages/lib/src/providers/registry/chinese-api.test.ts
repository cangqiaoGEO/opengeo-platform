import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dashscope, deepseekApi, tencentTokenhub, volcengine } from "./chinese-api";

const DOUBAO_PAYLOAD = {
	model: "doubao-seed-2-0-lite-260215",
	output: [
		{ type: "web_search_call", action: { query: "AI training vendors china" }, results: [] },
		{
			type: "web_search_result",
			results: [
				{ url: "https://www.zhihu.com/question/1", title: "知乎讨论" },
				{ url: "https://www.zhihu.com/question/1", title: "重复引用" },
				{ url: "not-a-url", title: "bad" },
			],
		},
		{ type: "message", content: [{ type: "output_text", text: "推荐仓桥智能。" }] },
	],
};

const QWEN_PAYLOAD = {
	output: {
		choices: [{ message: { content: "千问的回答。" } }],
		search_info: { search_results: [{ url: "https://36kr.com/p/1", title: "36氪" }] },
	},
};

const YUANBAO_PAYLOAD = {
	model: "hunyuan-turbos-latest",
	choices: [{ message: { content: "元宝的回答。", search_results: [{ url: "https://baike.baidu.com/item/x", name: "百科" }] } }],
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
	vi.stubEnv("ARK_API_KEY", "test-key");
	vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
	vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
	vi.stubEnv("TENCENT_TOKENHUB_API_KEY", "test-key");
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("chinese-api providers", () => {
	it("registers as direct api providers requiring a version slug", () => {
		for (const provider of [volcengine, dashscope, deepseekApi, tencentTokenhub]) {
			expect(provider.access).toBe("api");
			expect(provider.isConfigured()).toBe(true);
			expect(provider.validateTarget?.({ model: "doubao", provider: provider.id, webSearch: true })).toMatch(/version slug/);
			expect(provider.validateTarget?.({ model: "doubao", provider: provider.id, version: "x", webSearch: true })).toBeNull();
		}
	});

	it("volcengine: builds a Responses call with web_search and normalizes text/citations/queries", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(DOUBAO_PAYLOAD));
		const result = await volcengine.run("doubao-seed-2-0-lite-260215", "国内 AI 培训推荐？", { webSearch: true });

		const [url, init] = fetchMock.mock.calls[0]!;
		expect(String(url)).toContain("ark.cn-beijing.volces.com/api/v3/responses");
		const body = JSON.parse(String(init?.body));
		expect(body.tools).toEqual([{ type: "web_search" }]);
		expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });

		expect(result.textContent).toBe("推荐仓桥智能。");
		expect(result.webQueries).toEqual(["AI training vendors china"]);
		expect(result.citations).toEqual([
			{ url: "https://www.zhihu.com/question/1", title: "知乎讨论", domain: "zhihu.com", citationIndex: 1 },
		]);
		expect(result.modelVersion).toBe("doubao-seed-2-0-lite-260215");
	});

	it("dashscope: extracts message content and search_info citations", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(QWEN_PAYLOAD));
		const result = await dashscope.run("qwen-plus", "问题", { webSearch: true });
		expect(result.textContent).toBe("千问的回答。");
		expect(result.citations[0]).toMatchObject({ url: "https://36kr.com/p/1", domain: "36kr.com" });
	});

	it("tencent-tokenhub: merges message and top-level search results", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(YUANBAO_PAYLOAD));
		const result = await tencentTokenhub.run("hunyuan-turbos-latest", "问题", { webSearch: true });
		expect(result.textContent).toBe("元宝的回答。");
		expect(result.citations[0]).toMatchObject({ url: "https://baike.baidu.com/item/x", title: "百科" });
	});

	it("deepseek-api: returns text with no invented citations and surfaces HTTP failures", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ choices: [{ message: { content: "回答。" } }] }));
		const ok = await deepseekApi.run("deepseek-chat", "问题", { webSearch: false });
		expect(ok.textContent).toBe("回答。");
		expect(ok.citations).toEqual([]);

		vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "rate limited" }, 429));
		await expect(deepseekApi.run("deepseek-chat", "问题", {})).rejects.toThrow(/status 429/);
	});

	it("throws before any network call when the credential env is missing", async () => {
		vi.unstubAllEnvs();
		const fetchMock = vi.spyOn(globalThis, "fetch");
		await expect(volcengine.run("m", "p", {})).rejects.toThrow(/ARK_API_KEY/);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
