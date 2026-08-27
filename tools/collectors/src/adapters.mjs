/**
 * 中文引擎官方 API 适配：请求构建 + 答案文本/结构化引用提取。
 *
 * 端点、载荷与解析逻辑移植自 opengeo-audit brand-geo-audit/scripts/platform_adapters.py
 * （本组织 MIT，实测通过豆包/千问/DeepSeek/元宝四引擎）；注册接口形态对齐
 * elmo (https://github.com/elmohq/elmo) packages/lib/src/providers 的
 * Provider/ScrapeResult 模式（MIT, Blue Whale Software, LLC）。
 *
 * 铁律：凭证只从环境变量读取，本模块绝不接触、记录或回传 Key 本体。
 */

export const DEFAULTS = {
	doubao: { model: "doubao-seed-2-0-lite-260215", credentialEnv: "ARK_API_KEY" },
	qwen: { model: "qwen-plus", credentialEnv: "DASHSCOPE_API_KEY" },
	deepseek: { model: "deepseek-chat", credentialEnv: "DEEPSEEK_API_KEY" },
	yuanbao: { model: "hunyuan-turbos-latest", credentialEnv: "TENCENT_TOKENHUB_API_KEY" },
	// 第二批中文引擎（api 通道）：均为 OpenAI 兼容的 chat/completions，
	// 但各家联网开关与引用字段位置不同，见 buildProviderRequest / extractCitations。
	ernie: { model: "ernie-4.5-turbo-128k", credentialEnv: "QIANFAN_API_KEY" },
	kimi: { model: "kimi-k2-0905-preview", credentialEnv: "MOONSHOT_API_KEY" },
	spark: { model: "4.0Ultra", credentialEnv: "SPARK_API_PASSWORD" },
	zhipu: { model: "glm-4.6", credentialEnv: "ZHIPU_API_KEY" },
	// 国际引擎（api 通道）：请求形态对齐 elmo openai-api/anthropic-api 的实证参数
	chatgpt: { model: "gpt-5-mini", credentialEnv: "OPENAI_API_KEY" },
	claude: { model: "claude-sonnet-5", credentialEnv: "ANTHROPIC_API_KEY" },
	gemini: { model: "gemini-2.5-flash", credentialEnv: "GEMINI_API_KEY" },
	perplexity: { model: "sonar", credentialEnv: "PERPLEXITY_API_KEY" },
};

/**
 * 只能经 scraped 通道（user_reported）观测的中文引擎：无公开消费者 API。
 * 列出来是为了让界面能明确告诉用户"这些引擎请粘贴回答"，而不是静默缺席。
 */
export const SCRAPED_ONLY_ENGINES = {
	"baidu-ai": "百度AI搜索",
	"quark-ai": "夸克AI",
	"nano-ai": "纳米AI",
	"douyin-ai": "抖音AI搜索",
};

/** 构建一次官方 API 调用的无凭证请求描述（凭证环境变量名单独给出）。 */
export function buildProviderRequest({ engine, prompt, model, maxOutputTokens = 2048, temperature = 0.2, search = true }) {
	const resolvedModel = model ?? DEFAULTS[engine]?.model;
	if (engine === "doubao") {
		const body = {
			model: resolvedModel,
			input: prompt,
			thinking: { type: "disabled" },
			max_output_tokens: maxOutputTokens,
		};
		if (search) body.tools = [{ type: "web_search" }];
		return { url: "https://ark.cn-beijing.volces.com/api/v3/responses", credentialEnv: DEFAULTS.doubao.credentialEnv, body };
	}
	if (engine === "qwen") {
		return {
			url: "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
			credentialEnv: DEFAULTS.qwen.credentialEnv,
			body: {
				model: resolvedModel,
				input: { messages: [{ role: "user", content: prompt }] },
				parameters: {
					enable_search: search,
					search_options: { forced_search: search, enable_source: true, enable_citation: true, citation_format: "[ref_<number>]" },
					temperature,
					max_tokens: maxOutputTokens,
					result_format: "message",
				},
			},
		};
	}
	if (engine === "deepseek") {
		return {
			url: "https://api.deepseek.com/chat/completions",
			credentialEnv: DEFAULTS.deepseek.credentialEnv,
			body: {
				model: resolvedModel,
				messages: [{ role: "user", content: prompt }],
				thinking: { type: "disabled" },
				temperature,
				max_tokens: maxOutputTokens,
			},
		};
	}
	if (engine === "yuanbao") {
		const body = {
			model: resolvedModel,
			messages: [{ role: "user", content: prompt }],
			reasoning_effort: "no_think",
			temperature,
			max_tokens: maxOutputTokens,
			stream: false,
		};
		if (search) body.web_search_options = { enable: true };
		return { url: "https://tokenhub.tencentmaas.com/v1/chat/completions", credentialEnv: DEFAULTS.yuanbao.credentialEnv, body };
	}
	if (engine === "ernie") {
		// 百度千帆 v2（OpenAI 兼容）；联网走顶层 web_search，enable_trace 才回引用
		const body = {
			model: resolvedModel,
			messages: [{ role: "user", content: prompt }],
			temperature,
			max_completion_tokens: maxOutputTokens,
		};
		if (search) body.web_search = { enable: true, enable_trace: true };
		return { url: "https://qianfan.baidubce.com/v2/chat/completions", credentialEnv: DEFAULTS.ernie.credentialEnv, auth: "bearer", body };
	}
	if (engine === "kimi") {
		// Moonshot：联网是内置函数工具，模型自行决定调用
		const body = {
			model: resolvedModel,
			messages: [{ role: "user", content: prompt }],
			temperature,
			max_tokens: maxOutputTokens,
		};
		if (search) body.tools = [{ type: "builtin_function", function: { name: "$web_search" } }];
		return { url: "https://api.moonshot.cn/v1/chat/completions", credentialEnv: DEFAULTS.kimi.credentialEnv, auth: "bearer", body };
	}
	if (engine === "spark") {
		// 讯飞星火：show_ref_label 才回引用，落在 plugins.web_search
		const body = {
			model: resolvedModel,
			messages: [{ role: "user", content: prompt }],
			temperature,
			max_tokens: maxOutputTokens,
		};
		if (search) body.tools = [{ type: "web_search", web_search: { enable: true, show_ref_label: true } }];
		return { url: "https://spark-api-open.xf-yun.com/v1/chat/completions", credentialEnv: DEFAULTS.spark.credentialEnv, auth: "bearer", body };
	}
	if (engine === "zhipu") {
		// 智谱 GLM：search_result 才把检索结果回传
		const body = {
			model: resolvedModel,
			messages: [{ role: "user", content: prompt }],
			temperature,
			max_tokens: maxOutputTokens,
		};
		if (search) body.tools = [{ type: "web_search", web_search: { enable: true, search_result: true } }];
		return { url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", credentialEnv: DEFAULTS.zhipu.credentialEnv, auth: "bearer", body };
	}
	if (engine === "chatgpt") {
		// OpenAI Responses API；web_search 上限对齐 elmo 的成本封顶（maxToolCalls 2 / context low）
		const body = { model: resolvedModel, input: prompt, max_output_tokens: maxOutputTokens };
		if (search) {
			body.tools = [{ type: "web_search", search_context_size: "low" }];
			body.max_tool_calls = 2;
		}
		return { url: "https://api.openai.com/v1/responses", credentialEnv: DEFAULTS.chatgpt.credentialEnv, auth: "bearer", body };
	}
	if (engine === "claude") {
		const body = {
			model: resolvedModel,
			max_tokens: maxOutputTokens,
			messages: [{ role: "user", content: prompt }],
		};
		if (search) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }];
		return {
			url: "https://api.anthropic.com/v1/messages",
			credentialEnv: DEFAULTS.claude.credentialEnv,
			auth: "x-api-key",
			headers: { "anthropic-version": "2023-06-01" },
			body,
		};
	}
	if (engine === "gemini") {
		const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens, temperature } };
		if (search) body.tools = [{ google_search: {} }];
		return {
			url: `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent`,
			credentialEnv: DEFAULTS.gemini.credentialEnv,
			auth: "x-goog-api-key",
			body,
		};
	}
	if (engine === "perplexity") {
		// Perplexity 天生联网（sonar 系列），无独立 search 开关
		return {
			url: "https://api.perplexity.ai/chat/completions",
			credentialEnv: DEFAULTS.perplexity.credentialEnv,
			auth: "bearer",
			body: { model: resolvedModel, messages: [{ role: "user", content: prompt }], max_tokens: maxOutputTokens, temperature },
		};
	}
	throw new Error(`不支持的引擎: ${engine}`);
}

/** 从原始载荷提取最终答案文本；取不到返回 null（保留完整载荷另存）。 */
export function extractText(engine, payload) {
	if (engine === "doubao") {
		const anthropicParts = (payload?.content ?? []).filter((i) => i?.type === "text").map((i) => i.text ?? "");
		if (anthropicParts.length) return anthropicParts.filter(Boolean).join("\n") || null;
		const parts = [];
		for (const item of payload?.output ?? []) {
			if (item?.type === "message")
				parts.push(...(item.content ?? []).filter((c) => c?.type === "output_text").map((c) => c.text ?? ""));
		}
		if (parts.length) return parts.filter(Boolean).join("\n") || null;
		return payload?.choices?.[0]?.message?.content ?? null;
	}
	if (engine === "qwen") {
		if (Array.isArray(payload?.output)) {
			const parts = [];
			for (const item of payload.output) {
				if (item?.type === "message")
					parts.push(...(item.content ?? []).filter((c) => c?.type === "output_text").map((c) => c.text ?? ""));
			}
			return parts.filter(Boolean).join("\n") || null;
		}
		const choices = payload?.output?.choices ?? [];
		if (choices.length) {
			const content = choices[0]?.message?.content;
			return typeof content === "string" ? content : null;
		}
		return payload?.output?.text ?? null;
	}
	if (
		engine === "deepseek" || engine === "yuanbao" || engine === "perplexity" ||
		engine === "ernie" || engine === "kimi" || engine === "spark" || engine === "zhipu"
	) {
		return payload?.choices?.[0]?.message?.content ?? null;
	}
	if (engine === "chatgpt") {
		const parts = [];
		for (const item of payload?.output ?? []) {
			if (item?.type === "message")
				parts.push(...(item.content ?? []).filter((c) => c?.type === "output_text").map((c) => c.text ?? ""));
		}
		return parts.filter(Boolean).join("\n") || null;
	}
	if (engine === "claude") {
		const parts = (payload?.content ?? []).filter((b) => b?.type === "text").map((b) => b.text ?? "");
		return parts.filter(Boolean).join("\n") || null;
	}
	if (engine === "gemini") {
		const parts = (payload?.candidates?.[0]?.content?.parts ?? []).map((p) => p?.text ?? "");
		return parts.filter(Boolean).join("\n") || null;
	}
	return null;
}

/** 只提取显式结构化引用，绝不从行文里猜 URL。 */
export function extractCitations(engine, payload) {
	const candidates = [];
	if (engine === "qwen") {
		if (Array.isArray(payload?.output)) {
			for (const item of payload.output) {
				if (item?.type === "web_search_call") candidates.push(...(item.action?.sources ?? []));
			}
		} else {
			candidates.push(...(payload?.output?.search_info?.search_results ?? []));
		}
	} else if (engine === "doubao") {
		for (const item of payload?.output ?? []) {
			if (item?.type === "web_search_result" || item?.type === "web_search_call") candidates.push(...(item.results ?? []));
		}
	} else if (engine === "yuanbao") {
		const choices = payload?.choices ?? [];
		if (choices.length) candidates.push(...(choices[0]?.message?.search_results ?? []));
		if (payload?.search_info && typeof payload.search_info === "object")
			candidates.push(...(payload.search_info.search_results ?? []));
	} else if (engine === "ernie") {
		// 千帆 enable_trace 把检索痕迹放在顶层 search_results
		candidates.push(...(payload?.search_results ?? []));
	} else if (engine === "kimi") {
		// Moonshot 内置搜索的引用挂在消息的 search_results / web_search_results
		const msg = payload?.choices?.[0]?.message ?? {};
		candidates.push(...(msg.search_results ?? []), ...(msg.web_search_results ?? []));
	} else if (engine === "spark") {
		// 星火把检索结果放在 plugins.web_search（部分版本为顶层 web_search）
		candidates.push(...(payload?.plugins?.web_search ?? []), ...(Array.isArray(payload?.web_search) ? payload.web_search : []));
	} else if (engine === "zhipu") {
		// GLM search_result:true 时回传顶层 web_search 数组，link 而非 url
		for (const item of payload?.web_search ?? []) {
			const url = item?.link ?? item?.url;
			if (url) candidates.push({ url, title: item?.title });
		}
	} else if (engine === "chatgpt") {
		for (const item of payload?.output ?? []) {
			if (item?.type !== "message") continue;
			for (const content of item.content ?? []) {
				for (const a of content?.annotations ?? []) {
					if (a?.type === "url_citation") candidates.push({ url: a.url, title: a.title });
				}
			}
		}
	} else if (engine === "claude") {
		// 对齐 elmo extractAnthropicCitations：两遍扫描——正文 citations 优先，工具结果兜底
		for (const block of payload?.content ?? []) {
			if (block?.type !== "text") continue;
			for (const c of block?.citations ?? []) {
				if (c?.type === "web_search_result_location") candidates.push({ url: c.url, title: c.title });
			}
		}
		for (const block of payload?.content ?? []) {
			if (block?.type !== "web_search_tool_result" || !Array.isArray(block?.content)) continue;
			for (const r of block.content) {
				if (r?.type === "web_search_result") candidates.push({ url: r.url, title: r.title });
			}
		}
	} else if (engine === "gemini") {
		for (const chunk of payload?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
			if (chunk?.web?.uri) candidates.push({ url: chunk.web.uri, title: chunk.web.title });
		}
	}
	const citations = [];
	for (const item of candidates) {
		const url = item?.url;
		if (typeof url === "string" && /^https?:\/\//.test(url)) {
			const title = typeof item?.title === "string" ? item.title : typeof item?.name === "string" ? item.name : null;
			citations.push({ url, title });
		}
	}
	return citations;
}

/** 从载荷提取引擎实际执行过的搜索词（fan-out）；无法取得返回空数组。 */
export function extractWebQueries(engine, payload) {
	const queries = [];
	if (engine === "doubao" || engine === "qwen" || engine === "chatgpt") {
		for (const item of Array.isArray(payload?.output) ? payload.output : []) {
			if (item?.type === "web_search_call") {
				const q = item?.action?.query ?? item?.query;
				if (typeof q === "string" && q) queries.push(q);
			}
		}
	} else if (engine === "claude") {
		for (const block of payload?.content ?? []) {
			if (block?.type === "server_tool_use" && block?.name === "web_search") {
				const q = block?.input?.query;
				if (typeof q === "string" && q) queries.push(q);
			}
		}
	} else if (engine === "gemini") {
		for (const q of payload?.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? []) {
			if (typeof q === "string" && q) queries.push(q);
		}
	} else if (engine === "zhipu" || engine === "kimi" || engine === "ernie") {
		// 这几家把实际检索词混在检索结果条目里（字段名各不相同）
		const pools = [payload?.web_search, payload?.search_results, payload?.choices?.[0]?.message?.search_results];
		for (const pool of pools) {
			for (const item of Array.isArray(pool) ? pool : []) {
				const q = item?.query ?? item?.search_query;
				if (typeof q === "string" && q && !queries.includes(q)) queries.push(q);
			}
		}
	}
	return queries;
}
