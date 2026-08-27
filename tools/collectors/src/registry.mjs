/**
 * Provider 注册表 —— 架构对齐 elmo packages/lib/src/providers/index.ts 的
 * getProvider/Provider/ProviderAccess 模式（MIT, Blue Whale Software, LLC）。
 *
 * 每个 Provider：{ id, name, engine, access, isConfigured(), run(opts) → ObservationRecord }
 * 双通道（RFC-0005）：api = 官方 API 直连；scraped 当前由 user_reported
 * （用户从消费者产品粘贴真实回答）承载，浏览器自动采集在 opengeo-audit
 * 的宿主适配器里（本包后续版本吸收）。
 */

import { buildProviderRequest, DEFAULTS, extractCitations, extractText, extractWebQueries } from "./adapters.mjs";
import { makeRecord } from "./record.mjs";

/** 单次 API 调用超时（毫秒）。 */
export const API_TIMEOUT_MS = 90_000;

function apiProvider(engine, providerId) {
	return {
		id: providerId,
		name: `${engine} 官方 API`,
		engine,
		access: "api",
		credentialEnv: DEFAULTS[engine].credentialEnv,
		isConfigured() {
			return Boolean(process.env[DEFAULTS[engine].credentialEnv]);
		},
		async run({ prompt, queryId, model, search = true, surface, fetchImpl = fetch }) {
			const request = buildProviderRequest({ engine, prompt, model, search });
			const key = process.env[request.credentialEnv];
			if (!key) throw new Error(`${request.credentialEnv} 未配置`);
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
			const authHeader =
				request.auth === "x-api-key" ? { "x-api-key": key }
				: request.auth === "x-goog-api-key" ? { "x-goog-api-key": key }
				: { Authorization: `Bearer ${key}` };
			let response, payload;
			try {
				response = await fetchImpl(request.url, {
					method: "POST",
					headers: { "Content-Type": "application/json", ...authHeader, ...(request.headers ?? {}) },
					body: JSON.stringify(request.body),
					signal: controller.signal,
				});
				payload = await response.json().catch(() => null);
			} finally {
				clearTimeout(timer);
			}
			if (!response.ok || payload == null) {
				return makeRecord({
					engine, access: "api", provider: providerId, queryId, prompt,
					status: "error", text: "", searchExecuted: null, surface,
					modelRequested: request.body.model,
				});
			}
			const text = extractText(engine, payload) ?? "";
			const citations = extractCitations(engine, payload);
			const webQueries = extractWebQueries(engine, payload);
			return makeRecord({
				engine, access: "api", provider: providerId, queryId, prompt,
				status: text ? "ok" : "error", text, citations,
				searchExecuted: search ? (citations.length > 0 || webQueries.length > 0 ? true : null) : false,
				webQueries, surface,
				modelRequested: request.body.model,
				modelReported: typeof payload?.model === "string" ? payload.model : undefined,
			});
		},
	};
}

/** scraped 通道：用户从消费者产品（App/网页）粘贴真实回答。 */
const userReported = {
	id: "user_reported",
	name: "用户粘贴的消费者产品回答",
	engine: null, // 任意引擎
	access: "scraped",
	isConfigured() {
		return true;
	},
	async run({ engine, prompt, queryId, text, citations = [], surface }) {
		if (!text?.trim()) throw new Error("user_reported 需要非空回答文本");
		return makeRecord({
			engine, access: "scraped", provider: "user_reported", queryId, prompt,
			status: "ok", text: text.trim(), citations, searchExecuted: null, surface,
		});
	},
};

const providerMap = {
	volcengine: apiProvider("doubao", "volcengine"),
	dashscope: apiProvider("qwen", "dashscope"),
	deepseek: apiProvider("deepseek", "deepseek"),
	tencent_tokenhub: apiProvider("yuanbao", "tencent_tokenhub"),
	qianfan: apiProvider("ernie", "qianfan"),
	moonshot: apiProvider("kimi", "moonshot"),
	xfyun: apiProvider("spark", "xfyun"),
	bigmodel: apiProvider("zhipu", "bigmodel"),
	openai_api: apiProvider("chatgpt", "openai_api"),
	anthropic_api: apiProvider("claude", "anthropic_api"),
	google_api: apiProvider("gemini", "google_api"),
	perplexity_api: apiProvider("perplexity", "perplexity_api"),
	user_reported: userReported,
};

export function getProvider(id) {
	const p = providerMap[id];
	if (!p) throw new Error(`未知 provider: "${id}"`);
	return p;
}

export function listProviders() {
	return Object.values(providerMap).map((p) => ({
		id: p.id, name: p.name, engine: p.engine, access: p.access, configured: p.isConfigured(),
	}));
}

/** 引擎 → 默认 API provider 的映射。 */
export const ENGINE_API_PROVIDER = {
	doubao: "volcengine",
	qwen: "dashscope",
	deepseek: "deepseek",
	yuanbao: "tencent_tokenhub",
	ernie: "qianfan",
	kimi: "moonshot",
	spark: "xfyun",
	zhipu: "bigmodel",
	chatgpt: "openai_api",
	claude: "anthropic_api",
	gemini: "google_api",
	perplexity: "perplexity_api",
};
