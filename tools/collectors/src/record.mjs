/**
 * ObservationRecord v0.1（RFC-0005）：一次「向一个引擎的一个采集通道
 * 提交一条查询并取回答案」的观测记录。本文件是该格式的 JS 参考实现。
 */

export const SCHEMA_ID = "opengeo/observation-record/v0.1";

/**
 * 引擎枚举 v0.2（RFC-0005 §3）：中文引擎一等公民。
 * 后四个中文引擎（百度AI搜索 / 夸克AI / 纳米AI / 抖音AI）无公开消费者 API，
 * 只能经 scraped 通道（user_reported）记录——枚举收录它们是为了让这些观测
 * 有合法归属，而不是假装能自动采集。
 */
export const ENGINES = [
	"doubao", "qwen", "deepseek", "yuanbao", "kimi", "zhipu", "ernie", "spark",
	"baidu-ai", "quark-ai", "nano-ai", "douyin-ai",
	"chatgpt", "gemini", "perplexity", "claude", "copilot", "grok",
	"google-ai-overview", "google-ai-mode",
];

/**
 * 观测终端（RFC-0005 §2 选填字段）。同一问题在移动端与 PC 端的 AI 答案
 * 常不同（移动端答案更短、引用更少），聚合时应分列而非混算。
 */
export const SURFACES = ["pc", "mobile"];

export const ACCESS = ["scraped", "api"];
export const STATUS = ["ok", "error", "blocked"];

/** 组装一条观测记录；只做形态组装，校验交给 validateRecord。 */
export function makeRecord({
	engine, access, provider, queryId, prompt, status = "ok", text = "",
	citations = [], searchExecuted = null, webQueries, location, language, surface,
	modelRequested, modelReported, rawRef, collectedAt,
}) {
	const record = {
		schema: SCHEMA_ID,
		engine,
		access,
		provider,
		collected_at: collectedAt ?? new Date().toISOString(),
		query_id: queryId,
		prompt,
		status,
		text,
		citations,
		search_executed: searchExecuted,
	};
	if (webQueries?.length) record.web_queries = webQueries;
	if (surface) record.surface = surface;
	if (location) record.location = location;
	if (language) record.language = language;
	if (modelRequested) record.model_requested = modelRequested;
	if (modelReported) record.model_reported = modelReported;
	if (rawRef) record.raw_ref = rawRef;
	return record;
}

/** 校验一条观测记录，返回错误清单（空数组 = 合法）。 */
export function validateRecord(r) {
	const errors = [];
	if (r?.schema !== SCHEMA_ID) errors.push(`schema 必须为 ${SCHEMA_ID}`);
	if (!ENGINES.includes(r?.engine) && !/^x-[a-z0-9-]+$/.test(r?.engine ?? ""))
		errors.push(`engine 非法（枚举外需用 x- 前缀）: ${r?.engine}`);
	if (!ACCESS.includes(r?.access)) errors.push(`access 非法: ${r?.access}`);
	if (typeof r?.provider !== "string" || !r.provider) errors.push("provider 缺失");
	if (typeof r?.collected_at !== "string" || Number.isNaN(Date.parse(r.collected_at)))
		errors.push("collected_at 必须为合法时间串");
	if (typeof r?.query_id !== "string" || !r.query_id) errors.push("query_id 缺失");
	if (typeof r?.prompt !== "string" || !r.prompt) errors.push("prompt 缺失");
	if (!STATUS.includes(r?.status)) errors.push(`status 非法: ${r?.status}`);
	if (typeof r?.text !== "string") errors.push("text 必须为字符串（error 时可为空串）");
	if (r?.status === "ok" && !r?.text) errors.push("status=ok 时 text 不得为空");
	if (!Array.isArray(r?.citations)) errors.push("citations 必须为数组");
	else r.citations.forEach((c, i) => {
		if (typeof c?.url !== "string" || !/^https?:\/\//.test(c.url)) errors.push(`citations[${i}].url 非法`);
		if (c?.position !== undefined && (!Number.isInteger(c.position) || c.position < 1))
			errors.push(`citations[${i}].position 必须为 ≥1 的整数`);
	});
	if (r?.search_executed !== null && typeof r?.search_executed !== "boolean")
		errors.push("search_executed 必须为 boolean 或 null（未知）");
	if (r?.web_queries !== undefined && (!Array.isArray(r.web_queries) || r.web_queries.some((q) => typeof q !== "string" || !q)))
		errors.push("web_queries 必须为非空字符串数组");
	if (r?.surface !== undefined && !SURFACES.includes(r.surface))
		errors.push(`surface 非法（pc | mobile）: ${r.surface}`);
	if (r?.location !== undefined && !/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(r.location))
		errors.push(`location 非法（ISO 3166）: ${r.location}`);
	if (r?.language !== undefined && !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(r.language))
		errors.push(`language 非法（BCP 47）: ${r.language}`);
	return errors;
}
