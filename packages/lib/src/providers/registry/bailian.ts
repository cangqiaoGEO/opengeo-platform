import type { ModelConfig } from "@workspace/config/scrape-targets";
import { z } from "zod";
import { getCredential } from "../../secrets";
import type { Citation } from "../../text-extraction";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, warnIfOutputCapped } from "../config";
import type {
	Provider,
	ProviderOptions,
	ScrapeResult,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";

/**
 * Aliyun Bailian (百炼) Token Plan, reached through its OpenAI-compatible
 * surface. One key covers Qwen, DeepSeek, and GLM, which makes it the cheapest
 * way to run onboarding research and to track the Chinese engines at the model
 * layer.
 *
 * Two things this surface does NOT give us, both verified against the live
 * endpoint rather than assumed:
 *   • No citation payload. `enable_search` really does search — the model
 *     answers with facts it cannot have memorized and marks them [1][3] — but
 *     the response carries no search_info/annotations/sources, so there are no
 *     URLs to attribute. Citations come back empty rather than invented.
 *   • No `/v1/responses` and no OpenRouter-style `plugins` array (sending one
 *     is a 400), so neither openai-api nor openrouter can be pointed here.
 *
 * Qwen3 models reason by default and the thinking tokens eat the whole output
 * budget, so `enable_thinking` is off on every call.
 */

const DEFAULT_BASE_URL = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";
// The strongest model in the plan, and the difference shows: on the same brand
// qwen3.7-plus returned zero competitors and ignored the schema's "short
// search-style fragment" guidance, while 3.8-max found the competitor with its
// domain and parent company and wrote prompts in the requested shape.
const DEFAULT_RESEARCH_MODEL = "qwen3.8-max";
const TIMEOUT_MS = 120_000;

function baseUrl(): string {
	return (process.env.BAILIAN_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function headers(): Record<string, string> {
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${getCredential("BAILIAN_API_KEY")}`,
	};
}

async function postChat(body: Record<string, unknown>): Promise<any> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(`${baseUrl()}/chat/completions`, {
			method: "POST",
			headers: headers(),
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		const payload = await res.json().catch(() => null);
		if (!res.ok || payload == null) {
			throw new Error(`Bailian request failed (${res.status}): ${JSON.stringify(payload)?.slice(0, 500) ?? "no body"}`);
		}
		return payload;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Defensive: the compatible surface returns no sources today, but DashScope's
 * native API shapes them as search_info.search_results and the compatible mode
 * has been growing toward parity. Read both shapes so the day it starts
 * returning them we get citations without a code change.
 */
function extractCitations(payload: any): Citation[] {
	const raw: any[] = [
		...(payload?.search_info?.search_results ?? []),
		...(payload?.choices?.[0]?.message?.search_results ?? []),
		...(payload?.choices?.[0]?.message?.annotations ?? []),
	];
	const citations: Citation[] = [];
	const seen = new Set<string>();
	for (const item of raw) {
		const cite = item?.url_citation ?? item;
		const url = cite?.url;
		if (typeof url !== "string" || !/^https?:\/\//.test(url) || seen.has(url)) continue;
		let domain: string;
		try {
			domain = new URL(url).hostname.replace(/^www\./, "");
		} catch {
			continue;
		}
		seen.add(url);
		citations.push({
			url,
			title: typeof cite.title === "string" ? cite.title : undefined,
			domain,
			citationIndex: citations.length,
		});
	}
	return citations;
}

function searchParams(webSearch: boolean): Record<string, unknown> {
	if (!webSearch) return {};
	return {
		enable_search: true,
		search_options: { forced_search: true, enable_source: true, enable_citation: true },
	};
}

export const bailian: Provider = {
	id: "bailian",
	name: "Aliyun Bailian (OpenAI-compatible)",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured() {
		return !!getCredential("BAILIAN_API_KEY");
	},

	validateTarget(config: ModelConfig): string | null {
		if (!config.version) {
			return `"${config.model}:bailian" requires a version slug (the concrete model id, e.g. ${config.model}:bailian:${DEFAULT_RESEARCH_MODEL})`;
		}
		return null;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? model;
		const payload = await postChat({
			model: version,
			messages: [{ role: "user", content: prompt }],
			max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS.bailian,
			enable_thinking: false,
			...searchParams(options?.webSearch ?? false),
		});

		const choice = payload?.choices?.[0];
		warnIfOutputCapped("bailian", version, choice?.finish_reason);

		return {
			rawOutput: payload,
			textContent: choice?.message?.content ?? "",
			// The surface exposes neither the queries it ran nor the pages it
			// read, so both stay empty instead of carrying a fabricated signal.
			webQueries: [],
			citations: extractCitations(payload),
			modelVersion: typeof payload?.model === "string" ? payload.model : version,
		};
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		webSearch = true,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const payload = await postChat({
			model: DEFAULT_RESEARCH_MODEL,
			messages: [{ role: "user", content: prompt }],
			max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS.bailian,
			enable_thinking: false,
			response_format: {
				type: "json_schema",
				json_schema: { name: "research_output", strict: true, schema: z.toJSONSchema(schema as z.ZodType) },
			},
			...searchParams(webSearch),
		});

		const content = payload?.choices?.[0]?.message?.content;
		if (typeof content !== "string") {
			throw new Error(`Bailian returned no JSON content (model=${DEFAULT_RESEARCH_MODEL})`);
		}
		return {
			object: (schema as z.ZodType).parse(JSON.parse(content)) as T,
			modelVersion: DEFAULT_RESEARCH_MODEL,
		};
	},
};
