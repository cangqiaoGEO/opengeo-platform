import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProviderRequest, extractCitations, extractText, extractWebQueries } from "../src/adapters.mjs";

test("buildProviderRequest：四引擎端点与凭证环境变量（对齐 audit platform_adapters）", () => {
	const doubao = buildProviderRequest({ engine: "doubao", prompt: "问" });
	assert.equal(doubao.url, "https://ark.cn-beijing.volces.com/api/v3/responses");
	assert.equal(doubao.credentialEnv, "ARK_API_KEY");
	assert.deepEqual(doubao.body.tools, [{ type: "web_search" }]);

	const qwen = buildProviderRequest({ engine: "qwen", prompt: "问" });
	assert.match(qwen.url, /dashscope\.aliyuncs\.com/);
	assert.equal(qwen.body.parameters.search_options.enable_citation, true);

	const ds = buildProviderRequest({ engine: "deepseek", prompt: "问", search: false });
	assert.equal(ds.url, "https://api.deepseek.com/chat/completions");
	assert.equal(ds.body.messages[0].content, "问");

	const yb = buildProviderRequest({ engine: "yuanbao", prompt: "问" });
	assert.match(yb.url, /tokenhub\.tencentmaas\.com/);
	assert.deepEqual(yb.body.web_search_options, { enable: true });
	assert.equal(buildProviderRequest({ engine: "yuanbao", prompt: "x", search: false }).body.web_search_options, undefined);

	// scraped-only 引擎没有 API 通道，构建请求必须明确抛错
	assert.throws(() => buildProviderRequest({ engine: "quark-ai", prompt: "x" }), /不支持的引擎/);
});

test("extractText：豆包 Responses / 千问 generation / OpenAI 兼容三种形态", () => {
	assert.equal(
		extractText("doubao", { output: [{ type: "message", content: [{ type: "output_text", text: "答案A" }] }] }),
		"答案A",
	);
	assert.equal(extractText("doubao", { content: [{ type: "text", text: "Anthropic形态" }] }), "Anthropic形态");
	assert.equal(
		extractText("qwen", { output: { choices: [{ message: { content: "千问答案" } }] } }),
		"千问答案",
	);
	assert.equal(extractText("deepseek", { choices: [{ message: { content: "DS答案" } }] }), "DS答案");
	assert.equal(extractText("yuanbao", { choices: [] }), null);
});

test("extractCitations：只取显式结构化引用，过滤非法 URL", () => {
	const doubao = extractCitations("doubao", {
		output: [{ type: "web_search_call", results: [
			{ url: "https://zhihu.com/q/1", title: "知乎" },
			{ url: "javascript:alert(1)", title: "坏" },
		] }],
	});
	assert.deepEqual(doubao, [{ url: "https://zhihu.com/q/1", title: "知乎" }]);

	const yb = extractCitations("yuanbao", {
		choices: [{ message: { search_results: [{ url: "https://baike.baidu.com/x", name: "百科" }] } }],
		search_info: { search_results: [{ url: "https://news.qq.com/y", title: "腾讯新闻" }] },
	});
	assert.equal(yb.length, 2);
	assert.equal(yb[0].title, "百科");

	assert.deepEqual(extractCitations("deepseek", { choices: [] }), []);
});

test("extractWebQueries：fan-out 搜索词提取", () => {
	const qs = extractWebQueries("qwen", {
		output: [
			{ type: "web_search_call", action: { query: "品牌A 价格" } },
			{ type: "message", content: [] },
		],
	});
	assert.deepEqual(qs, ["品牌A 价格"]);
	assert.deepEqual(extractWebQueries("deepseek", {}), []);
});
