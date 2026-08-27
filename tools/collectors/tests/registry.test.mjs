import assert from "node:assert/strict";
import { test } from "node:test";
import { annotateObservation } from "../src/mentions.mjs";
import { validateRecord } from "../src/record.mjs";
import { ENGINE_API_PROVIDER, getProvider, listProviders } from "../src/registry.mjs";

test("registry：四引擎 API provider + user_reported，未知 id 抛错", () => {
	for (const id of Object.values(ENGINE_API_PROVIDER)) assert.equal(getProvider(id).access, "api");
	assert.equal(getProvider("user_reported").access, "scraped");
	assert.throws(() => getProvider("nope"), /未知 provider/);
	const listed = listProviders();
	assert.equal(listed.length, 13);
	assert.ok(listed.every((p) => typeof p.configured === "boolean"));
});

test("api provider：mock fetch 端到端产出合法 ObservationRecord", async () => {
	process.env.DEEPSEEK_API_KEY = "test-key-not-real";
	const provider = getProvider("deepseek");
	const record = await provider.run({
		prompt: "国内有哪些 AI 培训品牌值得推荐？",
		queryId: "q-reco-01",
		fetchImpl: async (url, init) => {
			assert.match(url, /api\.deepseek\.com/);
			assert.equal(JSON.parse(init.body).messages[0].role, "user");
			assert.match(init.headers.Authorization, /^Bearer /);
			return { ok: true, json: async () => ({ model: "deepseek-chat-v3", choices: [{ message: { content: "推荐仓桥智能等品牌。" } }] }) };
		},
	});
	assert.deepEqual(validateRecord(record), []);
	assert.equal(record.engine, "deepseek");
	assert.equal(record.access, "api");
	assert.equal(record.status, "ok");
	assert.equal(record.model_reported, "deepseek-chat-v3");
	delete process.env.DEEPSEEK_API_KEY;
});

test("api provider：HTTP 错误产出 status=error 的合法记录，未配置直接抛错", async () => {
	process.env.ARK_API_KEY = "test-key-not-real";
	const record = await getProvider("volcengine").run({
		prompt: "问",
		queryId: "q1",
		fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: "rate" }) }),
	});
	assert.equal(record.status, "error");
	assert.deepEqual(validateRecord(record), []);
	delete process.env.ARK_API_KEY;
	await assert.rejects(() => getProvider("volcengine").run({ prompt: "x", queryId: "q" }), /ARK_API_KEY 未配置/);
});

test("user_reported：粘贴回答产出 scraped 记录并可标注提及", async () => {
	const record = await getProvider("user_reported").run({
		engine: "doubao",
		prompt: "AI培训哪家好",
		queryId: "q-reco-02",
		text: "推荐仓桥智能和竞对A，都在杭州。",
		citations: [{ url: "https://zhihu.com/q/9", title: "知乎讨论" }],
	});
	assert.deepEqual(validateRecord(record), []);
	assert.equal(record.access, "scraped");
	const row = annotateObservation(record, { name: "仓桥智能", aliases: [], domains: [] }, [
		{ name: "竞对A", aliases: [], domains: [] },
		{ name: "竞对B", aliases: [], domains: [] },
	]);
	assert.equal(row.brand_mentioned, true);
	assert.deepEqual(row.competitors_mentioned, ["竞对A"]);
	await assert.rejects(() => getProvider("user_reported").run({ engine: "doubao", prompt: "x", queryId: "q", text: " " }), /非空/);
});

test("mentions：域名引用命中也算品牌提及", async () => {
	const record = await getProvider("user_reported").run({
		engine: "qwen", prompt: "问", queryId: "q3",
		text: "这里没有点名任何品牌。",
		citations: [{ url: "https://www.cangqiao.ai/about", title: "官网" }],
	});
	const row = annotateObservation(record, { name: "仓桥智能", domains: ["cangqiao.ai"] }, []);
	assert.equal(row.brand_mentioned, true);
});
