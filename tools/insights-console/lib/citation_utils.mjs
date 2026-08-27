// VENDORED from opengeo-audit brand-geo-audit/tools/citation_utils.mjs — 修改请先改源仓再同步此副本。
/**
 * 引用归一化与分类工具 —— RFC-0005 citations 字段配套。
 *
 * URL 校验/去重思路参考 elmo (https://github.com/elmohq/elmo)
 * packages/lib/src/text-extraction.ts 的 parseCitationUrl / 各 extractCitations
 * （Copyright (c) 2026 Blue Whale Software, LLC — MIT License）；
 * 分类法为本仓库自研，对齐 geo-metrics「引用源质量」维度的自有源/权威源口径。
 */

/** 校验并归一化一条引用；无效 URL 返回 null。 */
export function normalizeCitation(url, title, position) {
	if (typeof url !== "string") return null;
	let parsed;
	try {
		parsed = new URL(url.trim());
	} catch {
		return null;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
	return {
		url: parsed.href,
		title: typeof title === "string" && title.trim() ? title.trim() : null,
		...(Number.isInteger(position) && position >= 1 ? { position } : {}),
	};
}

/** 按 URL 去重（保留首次出现的 position/title），过滤无效项。 */
export function dedupeCitations(citations) {
	const seen = new Map();
	for (const c of citations) {
		const normalized = normalizeCitation(c?.url, c?.title, c?.position);
		if (!normalized) continue;
		if (!seen.has(normalized.url)) seen.set(normalized.url, normalized);
	}
	return [...seen.values()];
}

/** 提取注册域（朴素实现：取末两段，常见二级公共后缀取三段）。 */
export function citationDomain(url) {
	let host;
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		return null;
	}
	const parts = host.split(".").filter(Boolean);
	if (parts.length <= 2) return host;
	const twoLevelSuffixes = new Set(["com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn", "co.jp", "co.uk", "com.hk", "com.tw"]);
	const lastTwo = parts.slice(-2).join(".");
	return twoLevelSuffixes.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

/** 中文生态社媒/UGC 平台注册域（分类用，非穷举，可通过参数扩展）。 */
export const SOCIAL_DOMAINS = new Set([
	"zhihu.com", "xiaohongshu.com", "weibo.com", "douyin.com", "bilibili.com",
	"baijiahao.baidu.com", "toutiao.com", "36kr.com", "csdn.net", "juejin.cn",
	"reddit.com", "youtube.com", "x.com", "twitter.com", "linkedin.com", "medium.com",
]);

/** 机构/权威源注册域后缀（政府、高校、百科类）。 */
const INSTITUTIONAL_SUFFIXES = [".gov.cn", ".edu.cn", ".gov", ".edu", ".ac.cn"];
const INSTITUTIONAL_DOMAINS = new Set(["wikipedia.org", "baike.baidu.com"]);

/**
 * 引用来源分类（对齐 geo-metrics 引用源质量维度）：
 * own（自有源）→ competitor（竞对源）→ institutional（机构权威）→ social（社媒/UGC）→ other。
 * ownDomains / competitorDomains 传注册域数组。
 */
export function categorizeCitation(url, { ownDomains = [], competitorDomains = [], socialDomains = SOCIAL_DOMAINS } = {}) {
	const domain = citationDomain(url);
	if (!domain) return "invalid";
	let host = "";
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch { /* citationDomain 已兜底 */ }
	if (ownDomains.some((d) => domain === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))) return "own";
	if (competitorDomains.some((d) => domain === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))) return "competitor";
	if (INSTITUTIONAL_DOMAINS.has(domain) || INSTITUTIONAL_SUFFIXES.some((s) => host.endsWith(s))) return "institutional";
	if (socialDomains.has(domain) || socialDomains.has(host)) return "social";
	return "other";
}

/** 汇总一批引用的分类分布与去重后的域清单。 */
export function summarizeCitations(citations, options = {}) {
	const deduped = dedupeCitations(citations);
	const byCategory = { own: 0, competitor: 0, institutional: 0, social: 0, other: 0, invalid: 0 };
	const domains = new Map();
	for (const c of deduped) {
		const category = categorizeCitation(c.url, options);
		byCategory[category]++;
		const domain = citationDomain(c.url);
		if (domain) domains.set(domain, (domains.get(domain) || 0) + 1);
	}
	return {
		total: deduped.length,
		by_category: byCategory,
		top_domains: [...domains.entries()].sort((a, b) => b[1] - a[1]).map(([domain, count]) => ({ domain, count })),
	};
}
