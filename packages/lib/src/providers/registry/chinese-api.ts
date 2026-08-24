import type { ModelConfig } from "@workspace/config/scrape-targets";
import type { Citation } from "../../text-extraction";
import type { Provider, ProviderOptions, ScrapeResult } from "../types";

/**
 * Direct official-API providers for Chinese answer engines: Doubao (Volcengine
 * Ark), Qwen (DashScope), DeepSeek, and Tencent Yuanbao (TokenHub). None of the
 * scraping vendors in this registry reach these engines, so official APIs are
 * the only automatable channel today; the consumer-surface (scraped) channel
 * for them lives in OpenGEO's audit tooling.
 *
 * Endpoints, payloads, and extraction ported from OpenGEO's field-tested
 * collectors (opengeo-audit platform_adapters.py / opengeo-insights
 * collectors, MIT). Plain fetch on purpose: these APIs have no maintained AI
 * SDK routes, and a zero-dependency path keeps the fork's supply-chain rules
 * untouched.
 */

const MAX_OUTPUT_TOKENS = 8000;
const TIMEOUT_MS = 90_000;

interface EngineSpec {
	id: string;
	name: string;
	credentialEnv: string;
	buildRequest(model: string, prompt: string, webSearch: boolean): { url: string; headers?: Record<string, string>; body: unknown };
	extractText(payload: any): string;
	extractCitations(payload: any): Citation[];
	extractWebQueries(payload: any): string[];
}

function toCitations(candidates: Array<{ url?: unknown; title?: unknown; name?: unknown }>): Citation[] {
	const citations: Citation[] = [];
	const seen = new Set<string>();
	for (const item of candidates) {
		const url = item?.url;
		if (typeof url !== "string" || !/^https?:\/\//.test(url) || seen.has(url)) continue;
		let domain = "";
		try {
			domain = new URL(url).hostname.replace(/^www\./, "");
		} catch {
			continue;
		}
		seen.add(url);
		const rawTitle = typeof item?.title === "string" ? item.title : typeof item?.name === "string" ? item.name : undefined;
		citations.push({ url, title: rawTitle, domain, citationIndex: citations.length + 1 });
	}
	return citations;
}

function outputMessageText(payload: any): string {
	const parts: string[] = [];
	for (const item of Array.isArray(payload?.output) ? payload.output : []) {
		if (item?.type !== "message") continue;
		for (const content of item.content ?? []) {
			if (content?.type === "output_text" && content.text) parts.push(content.text);
		}
	}
	return parts.join("\n");
}

function outputWebQueries(payload: any): string[] {
	const queries: string[] = [];
	for (const item of Array.isArray(payload?.output) ? payload.output : []) {
		if (item?.type !== "web_search_call") continue;
		const q = item?.action?.query ?? item?.query;
		if (typeof q === "string" && q) queries.push(q);
	}
	return queries;
}

const doubao: EngineSpec = {
	id: "volcengine",
	name: "Doubao (Volcengine Ark API)",
	credentialEnv: "ARK_API_KEY",
	buildRequest(model, prompt, webSearch) {
		const body: Record<string, unknown> = {
			model,
			input: prompt,
			thinking: { type: "disabled" },
			max_output_tokens: MAX_OUTPUT_TOKENS,
		};
		if (webSearch) body.tools = [{ type: "web_search" }];
		return { url: "https://ark.cn-beijing.volces.com/api/v3/responses", body };
	},
	extractText(payload) {
		return outputMessageText(payload) || payload?.choices?.[0]?.message?.content || "";
	},
	extractCitations(payload) {
		const candidates: any[] = [];
		for (const item of Array.isArray(payload?.output) ? payload.output : []) {
			if (item?.type === "web_search_result" || item?.type === "web_search_call") candidates.push(...(item.results ?? []));
		}
		return toCitations(candidates);
	},
	extractWebQueries: outputWebQueries,
};

const qwen: EngineSpec = {
	id: "dashscope",
	name: "Qwen (DashScope API)",
	credentialEnv: "DASHSCOPE_API_KEY",
	buildRequest(model, prompt, webSearch) {
		return {
			url: "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
			body: {
				model,
				input: { messages: [{ role: "user", content: prompt }] },
				parameters: {
					enable_search: webSearch,
					search_options: { forced_search: webSearch, enable_source: true, enable_citation: true, citation_format: "[ref_<number>]" },
					max_tokens: MAX_OUTPUT_TOKENS,
					result_format: "message",
				},
			},
		};
	},
	extractText(payload) {
		if (Array.isArray(payload?.output)) return outputMessageText(payload);
		const choices = payload?.output?.choices ?? [];
		if (choices.length) {
			const content = choices[0]?.message?.content;
			if (typeof content === "string") return content;
		}
		return payload?.output?.text ?? "";
	},
	extractCitations(payload) {
		const candidates: any[] = [];
		if (Array.isArray(payload?.output)) {
			for (const item of payload.output) {
				if (item?.type === "web_search_call") candidates.push(...(item.action?.sources ?? []));
			}
		} else {
			candidates.push(...(payload?.output?.search_info?.search_results ?? []));
		}
		return toCitations(candidates);
	},
	extractWebQueries: outputWebQueries,
};

const deepseek: EngineSpec = {
	id: "deepseek-api",
	name: "DeepSeek (official API)",
	credentialEnv: "DEEPSEEK_API_KEY",
	buildRequest(model, prompt) {
		return {
			url: "https://api.deepseek.com/chat/completions",
			body: {
				model,
				messages: [{ role: "user", content: prompt }],
				thinking: { type: "disabled" },
				max_tokens: MAX_OUTPUT_TOKENS,
			},
		};
	},
	extractText(payload) {
		return payload?.choices?.[0]?.message?.content ?? "";
	},
	extractCitations() {
		// DeepSeek's chat API returns no structured citations today; never guess
		// URLs out of prose.
		return [];
	},
	extractWebQueries() {
		return [];
	},
};

const yuanbao: EngineSpec = {
	id: "tencent-tokenhub",
	name: "Tencent Yuanbao (TokenHub API)",
	credentialEnv: "TENCENT_TOKENHUB_API_KEY",
	buildRequest(model, prompt, webSearch) {
		const body: Record<string, unknown> = {
			model,
			messages: [{ role: "user", content: prompt }],
			reasoning_effort: "no_think",
			max_tokens: MAX_OUTPUT_TOKENS,
			stream: false,
		};
		if (webSearch) body.web_search_options = { enable: true };
		return { url: "https://tokenhub.tencentmaas.com/v1/chat/completions", body };
	},
	extractText(payload) {
		return payload?.choices?.[0]?.message?.content ?? "";
	},
	extractCitations(payload) {
		const candidates: any[] = [];
		const choices = payload?.choices ?? [];
		if (choices.length) candidates.push(...(choices[0]?.message?.search_results ?? []));
		if (payload?.search_info && typeof payload.search_info === "object")
			candidates.push(...(payload.search_info.search_results ?? []));
		return toCitations(candidates);
	},
	extractWebQueries() {
		return [];
	},
};

function makeProvider(spec: EngineSpec): Provider {
	return {
		id: spec.id,
		name: spec.name,
		access: "api",

		isConfigured() {
			return Boolean(process.env[spec.credentialEnv]);
		},

		validateTarget(config: ModelConfig): string | null {
			if (!config.version) return `"${config.model}:${spec.id}" requires a version slug (the concrete model id, e.g. third segment of SCRAPE_TARGETS)`;
			return null;
		},

		async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
			const key = process.env[spec.credentialEnv];
			if (!key) throw new Error(`${spec.credentialEnv} is not configured`);
			const request = spec.buildRequest(options?.version ?? model, prompt, options?.webSearch ?? false);
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
			let payload: any;
			try {
				const response = await fetch(request.url, {
					method: "POST",
					headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...(request.headers ?? {}) },
					body: JSON.stringify(request.body),
					signal: controller.signal,
				});
				payload = await response.json().catch(() => null);
				if (!response.ok || payload == null) {
					throw new Error(`${spec.name} request failed with status ${response.status}`);
				}
			} finally {
				clearTimeout(timer);
			}
			return {
				textContent: spec.extractText(payload),
				rawOutput: payload,
				webQueries: spec.extractWebQueries(payload),
				citations: spec.extractCitations(payload),
				modelVersion: typeof payload?.model === "string" ? payload.model : undefined,
			};
		},
	};
}

export const volcengine = makeProvider(doubao);
export const dashscope = makeProvider(qwen);
export const deepseekApi = makeProvider(deepseek);
export const tencentTokenhub = makeProvider(yuanbao);
