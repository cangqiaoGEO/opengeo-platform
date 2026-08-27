import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProviderRequest, extractCitations, extractText, extractWebQueries } from "../src/adapters.mjs";
import { validateRecord } from "../src/record.mjs";
import { ENGINE_API_PROVIDER, getProvider, listProviders } from "../src/registry.mjs";

test("buildProviderRequest：国际四引擎端点、鉴权方式与检索开关", () => {
	const gpt = buildProviderRequest({ engine: "chatgpt", prompt: "q" });
	assert.equal(gpt.url, "https://api.openai.com/v1/responses");
	assert.equal(gpt.auth, "bearer");
	assert.deepEqual(gpt.body.tools, [{ type: "web_search", search_context_size: "low" }]);
	assert.equal(gpt.body.max_tool_calls, 2);
	assert.equal(buildProviderRequest({ engine: "chatgpt", prompt: "q", search: false }).body.tools, undefined);

	const claude = buildProviderRequest({ engine: "claude", prompt: "q" });
	assert.equal(claude.auth, "x-api-key");
	assert.equal(claude.headers["anthropic-version"], "2023-06-01");
	assert.equal(claude.body.tools[0].type, "web_search_20250305");
	assert.equal(claude.body.tools[0].max_uses, 1);

	const gemini = buildProviderRequest({ engine: "gemini", prompt: "q" });
	assert.equal(gemini.auth, "x-goog-api-key");
	assert.match(gemini.url, /generativelanguage\.googleapis\.com.*gemini-2\.5-flash:generateContent/);
	assert.deepEqual(gemini.body.tools, [{ google_search: {} }]);

	const pplx = buildProviderRequest({ engine: "perplexity", prompt: "q" });
	assert.equal(pplx.auth, "bearer");
	assert.equal(pplx.body.model, "sonar");
});

test("extract*：ChatGPT Responses 载荷（文本 + url_citation + fan-out）", () => {
	const payload = {
		output: [
			{ type: "web_search_call", action: { query: "brand A review" } },
			{ type: "message", content: [{ type: "output_text", text: "Answer here.", annotations: [
				{ type: "url_citation", url: "https://example.com/review", title: "Review" },
			] }] },
		],
	};
	assert.equal(extractText("chatgpt", payload), "Answer here.");
	assert.deepEqual(extractCitations("chatgpt", payload), [{ url: "https://example.com/review", title: "Review" }]);
	assert.deepEqual(extractWebQueries("chatgpt", payload), ["brand A review"]);
});

test("extract*：Claude Messages 载荷（citations 优先 + server_tool_use fan-out）", () => {
	const payload = {
		content: [
			{ type: "server_tool_use", name: "web_search", input: { query: "brand comparison" } },
			{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a.com/1", title: "A" }] },
			{ type: "text", text: "Claude answer.", citations: [
				{ type: "web_search_result_location", url: "https://b.com/2", title: "B" },
			] },
		],
	};
	assert.equal(extractText("claude", payload), "Claude answer.");
	assert.deepEqual(extractCitations("claude", payload).map((c) => c.url), ["https://b.com/2", "https://a.com/1"]);
	assert.deepEqual(extractWebQueries("claude", payload), ["brand comparison"]);
});

test("extract*：Gemini grounding 载荷", () => {
	const payload = {
		candidates: [{
			content: { parts: [{ text: "Gemini answer." }] },
			groundingMetadata: {
				groundingChunks: [{ web: { uri: "https://c.com/3", title: "C" } }],
				webSearchQueries: ["brand price"],
			},
		}],
	};
	assert.equal(extractText("gemini", payload), "Gemini answer.");
	assert.deepEqual(extractCitations("gemini", payload), [{ url: "https://c.com/3", title: "C" }]);
	assert.deepEqual(extractWebQueries("gemini", payload), ["brand price"]);
});

test("registry：国际引擎映射齐全，gemini mock 端到端产出合法记录", async () => {
	for (const engine of ["chatgpt", "claude", "gemini", "perplexity"])
		assert.equal(getProvider(ENGINE_API_PROVIDER[engine]).engine, engine);
	assert.equal(listProviders().length, 13);

	process.env.GEMINI_API_KEY = "test-key-not-real";
	const record = await getProvider("google_api").run({
		prompt: "Which AI training vendors are worth considering?",
		queryId: "q-intl-01",
		fetchImpl: async (url, init) => {
			assert.equal(init.headers["x-goog-api-key"], "test-key-not-real");
			assert.equal(init.headers.Authorization, undefined);
			return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "Some answer." }] }, groundingMetadata: { groundingChunks: [], webSearchQueries: ["ai training vendors"] } }] }) };
		},
	});
	delete process.env.GEMINI_API_KEY;
	assert.deepEqual(validateRecord(record), []);
	assert.equal(record.engine, "gemini");
	assert.deepEqual(record.web_queries, ["ai training vendors"]);
	assert.equal(record.search_executed, true);
});
