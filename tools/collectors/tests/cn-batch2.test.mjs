import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProviderRequest, extractCitations, extractText, extractWebQueries, SCRAPED_ONLY_ENGINES } from "../src/adapters.mjs";
import { ENGINES, makeRecord, SURFACES, validateRecord } from "../src/record.mjs";
import { ENGINE_API_PROVIDER, getProvider, listProviders } from "../src/registry.mjs";

test("buildProviderRequest：第二批中文引擎端点、凭证与联网开关各不相同", () => {
	const ernie = buildProviderRequest({ engine: "ernie", prompt: "q" });
	assert.equal(ernie.url, "https://qianfan.baidubce.com/v2/chat/completions");
	assert.equal(ernie.credentialEnv, "QIANFAN_API_KEY");
	// enable_trace 是拿到引用的前提，不能漏
	assert.deepEqual(ernie.body.web_search, { enable: true, enable_trace: true });
	assert.equal(buildProviderRequest({ engine: "ernie", prompt: "q", search: false }).body.web_search, undefined);

	const kimi = buildProviderRequest({ engine: "kimi", prompt: "q" });
	assert.match(kimi.url, /api\.moonshot\.cn/);
	assert.equal(kimi.body.tools[0].type, "builtin_function");
	assert.equal(kimi.body.tools[0].function.name, "$web_search");

	const spark = buildProviderRequest({ engine: "spark", prompt: "q" });
	assert.match(spark.url, /spark-api-open\.xf-yun\.com/);
	assert.equal(spark.body.tools[0].web_search.show_ref_label, true);
	assert.equal(spark.body.model, "4.0Ultra");

	const zhipu = buildProviderRequest({ engine: "zhipu", prompt: "q" });
	assert.match(zhipu.url, /open\.bigmodel\.cn/);
	assert.equal(zhipu.body.tools[0].web_search.search_result, true);
});

test("extractText：四家均为 OpenAI 兼容 choices 形态", () => {
	for (const engine of ["ernie", "kimi", "spark", "zhipu"]) {
		assert.equal(extractText(engine, { choices: [{ message: { content: `${engine} 的回答` } }] }), `${engine} 的回答`);
		assert.equal(extractText(engine, { choices: [] }), null);
	}
});

test("extractCitations：各家引用字段位置不同，均归一为 {url,title}", () => {
	assert.deepEqual(
		extractCitations("ernie", { search_results: [{ url: "https://baike.baidu.com/x", title: "百科" }] }),
		[{ url: "https://baike.baidu.com/x", title: "百科" }],
	);
	assert.deepEqual(
		extractCitations("kimi", { choices: [{ message: { search_results: [{ url: "https://a.cn/1", title: "A" }] } }] }),
		[{ url: "https://a.cn/1", title: "A" }],
	);
	assert.deepEqual(
		extractCitations("spark", { plugins: { web_search: [{ url: "https://b.cn/2", title: "B" }] } }),
		[{ url: "https://b.cn/2", title: "B" }],
	);
	// 智谱用 link 而非 url
	assert.deepEqual(
		extractCitations("zhipu", { web_search: [{ link: "https://c.cn/3", title: "C" }] }),
		[{ url: "https://c.cn/3", title: "C" }],
	);
	// 非法 URL 一律过滤，绝不从行文猜
	assert.deepEqual(extractCitations("ernie", { search_results: [{ url: "javascript:x" }] }), []);
});

test("extractWebQueries：从检索结果条目里回收实际检索词并去重", () => {
	const qs = extractWebQueries("zhipu", {
		web_search: [{ query: "品牌A 口碑", link: "https://x" }, { query: "品牌A 口碑", link: "https://y" }],
	});
	assert.deepEqual(qs, ["品牌A 口碑"]);
	assert.deepEqual(extractWebQueries("spark", {}), []);
});

test("registry：四个新 provider 注册且映射正确，共 13 个", () => {
	for (const [engine, providerId] of Object.entries({ ernie: "qianfan", kimi: "moonshot", spark: "xfyun", zhipu: "bigmodel" })) {
		assert.equal(ENGINE_API_PROVIDER[engine], providerId);
		const p = getProvider(providerId);
		assert.equal(p.engine, engine);
		assert.equal(p.access, "api");
	}
	assert.equal(listProviders().length, 13);
});

test("qianfan：mock fetch 端到端产出合法记录（含引用与检索词）", async () => {
	process.env.QIANFAN_API_KEY = "test-key-not-real";
	const record = await getProvider("qianfan").run({
		prompt: "南京江宁区轮胎热熔补哪家好？",
		queryId: "q-local-01",
		fetchImpl: async (url, init) => {
			assert.match(url, /qianfan\.baidubce\.com/);
			assert.equal(init.headers.Authorization, "Bearer test-key-not-real");
			return {
				ok: true,
				json: async () => ({
					model: "ernie-4.5-turbo-128k",
					choices: [{ message: { content: "推荐江宁区忠新汽车服务部。" } }],
					search_results: [{ url: "https://map.baidu.com/x", title: "地图", query: "江宁 轮胎热熔补" }],
				}),
			};
		},
	});
	delete process.env.QIANFAN_API_KEY;
	assert.deepEqual(validateRecord(record), []);
	assert.equal(record.engine, "ernie");
	assert.equal(record.search_executed, true);
	assert.deepEqual(record.web_queries, ["江宁 轮胎热熔补"]);
	assert.equal(record.model_reported, "ernie-4.5-turbo-128k");
});

test("scraped-only 引擎：进枚举可记录，但没有 API provider（不假装能自动采集）", () => {
	for (const engine of Object.keys(SCRAPED_ONLY_ENGINES)) {
		assert.ok(ENGINES.includes(engine), `${engine} 应在引擎枚举内`);
		assert.equal(ENGINE_API_PROVIDER[engine], undefined, `${engine} 不应有 API provider`);
	}
	assert.equal(SCRAPED_ONLY_ENGINES["quark-ai"], "夸克AI");
});

test("surface 维度：pc/mobile 可记录并受校验，非法值被拒", async () => {
	assert.deepEqual(SURFACES, ["pc", "mobile"]);
	const record = await getProvider("user_reported").run({
		engine: "quark-ai",
		prompt: "江宁区轮胎热熔补推荐",
		queryId: "q-local-01",
		text: "夸克AI 移动端推荐了忠新汽车服务部。",
		surface: "mobile",
	});
	assert.deepEqual(validateRecord(record), []);
	assert.equal(record.surface, "mobile");
	assert.equal(record.access, "scraped");

	const bad = makeRecord({ engine: "doubao", access: "api", provider: "volcengine", queryId: "q", prompt: "p", text: "t", surface: "tablet" });
	assert.ok(validateRecord(bad).some((e) => /surface 非法/.test(e)));
	// 不填 surface 依然合法（选填字段）
	const noSurface = makeRecord({ engine: "doubao", access: "api", provider: "volcengine", queryId: "q", prompt: "p", text: "t" });
	assert.equal("surface" in noSurface, false);
	assert.deepEqual(validateRecord(noSurface), []);
});
