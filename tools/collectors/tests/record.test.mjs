import assert from "node:assert/strict";
import { test } from "node:test";
import { makeRecord, validateRecord } from "../src/record.mjs";

const base = () =>
	makeRecord({
		engine: "doubao", access: "api", provider: "volcengine",
		queryId: "q1", prompt: "问", text: "答", searchExecuted: true,
	});

test("validateRecord：合法记录零错误；选填字段格式受校验", () => {
	assert.deepEqual(validateRecord(base()), []);
	const full = makeRecord({
		engine: "qwen", access: "scraped", provider: "user_reported",
		queryId: "q2", prompt: "问", text: "答",
		citations: [{ url: "https://a.com/x", title: null, position: 1 }],
		webQueries: ["搜索词"], location: "CN-ZJ", language: "zh-Hans",
	});
	assert.deepEqual(validateRecord(full), []);
});

test("validateRecord：核心非法形态逐项报错", () => {
	const cases = [
		[{ ...base(), engine: "unknown-engine" }, /engine 非法/],
		[{ ...base(), access: "browser" }, /access 非法/],
		[{ ...base(), status: "ok", text: "" }, /text 不得为空/],
		[{ ...base(), citations: [{ url: "notaurl" }] }, /url 非法/],
		[{ ...base(), citations: [{ url: "https://a.com", position: 0 }] }, /position/],
		[{ ...base(), search_executed: "yes" }, /search_executed/],
		[{ ...base(), location: "china" }, /location 非法/],
		[{ ...base(), language: "中文" }, /language 非法/],
	];
	for (const [record, pattern] of cases) {
		const errors = validateRecord(record);
		assert.ok(errors.some((e) => pattern.test(e)), `期望 ${pattern} 命中，实际: ${errors.join(" | ")}`);
	}
});

test("validateRecord：x- 前缀引擎放行（RFC-0005 §3 未收录引擎先行规则）", () => {
	assert.deepEqual(validateRecord({ ...base(), engine: "x-mita" }), []);
});
