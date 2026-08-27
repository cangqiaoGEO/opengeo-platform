/**
 * 品牌/竞对提及判定 —— 概念对齐 elmo 的 brand mention tracking
 * （品牌名 + 别名 + 域名，同一规则跨引擎一致计数）。
 * 中文无词边界，用大小写不敏感的子串匹配；域名匹配去协议与 www。
 */

function normalizeHost(domain) {
	return domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
}

/** 文本中是否提及某实体（名称/别名任一命中即提及）。 */
export function textMentions(text, { name, aliases = [] }) {
	if (!text) return false;
	const haystack = text.toLowerCase();
	return [name, ...aliases].filter(Boolean).some((n) => haystack.includes(n.toLowerCase()));
}

/** 引用列表中是否出现某实体的域名。 */
export function citationsMention(citations, { domains = [] }) {
	const targets = domains.map(normalizeHost).filter(Boolean);
	if (!targets.length) return false;
	return citations.some((c) => {
		let host;
		try {
			host = new URL(c.url).hostname.replace(/^www\./, "").toLowerCase();
		} catch {
			return false;
		}
		return targets.some((t) => host === t || host.endsWith(`.${t}`));
	});
}

/**
 * 把一条 ObservationRecord 标注为 SoV 轻量行（RFC-0006 输入形态）：
 * { query_id, brand_mentioned, competitors_mentioned[] }
 * brand: {name, aliases, domains}；competitors: [{name, aliases, domains}]
 */
export function annotateObservation(record, brand, competitors = []) {
	const brandMentioned =
		textMentions(record.text, brand) || citationsMention(record.citations ?? [], brand);
	const competitorsMentioned = competitors
		.filter((c) => textMentions(record.text, c) || citationsMention(record.citations ?? [], c))
		.map((c) => c.name);
	return {
		query_id: record.query_id,
		engine: record.engine,
		access: record.access,
		brand_mentioned: brandMentioned,
		competitors_mentioned: competitorsMentioned,
	};
}
